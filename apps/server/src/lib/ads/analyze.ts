import { and, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { vod, vodPlay } from '@lcm/db';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/** 一次分析抽多少个作品 */
export const SAMPLE_SIZE = 10;
/** 一段候选广告的最短 / 最长时长（秒），超过 30 秒的不当作广告 */
const MIN_AD_SECONDS = 6;
const MAX_AD_SECONDS = 30;
/** 一个候选最多跨几个 discontinuity 组 */
const MAX_SPAN_GROUPS = 3;

export interface SampleVod {
  id: number;
  name: string;
  episode: string;
  url: string;
}

export interface Segment {
  dur: number;
  uri: string;
}

export interface Candidate {
  durs: number[];
  totalMs: number;
  kind: 1 | 2 | 3;
  startIndex: number;
}

export interface FoundFeature {
  durations: string;
  totalMs: number;
  kind: 1 | 2 | 3;
  hitVods: number;
  sample: Array<{ vod_id: number; vod_name: string; start: number; start_sec: number; url: string }>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}

async function fetchTextOnce(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: '*/*' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}（${hostOf(url)}）`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`响应为空（${hostOf(url)}）`);
  return text;
}

/** 拉取重试一次：源站偶发 403 / 超时很常见，重试基本能恢复 */
async function fetchText(url: string): Promise<string> {
  try {
    return await fetchTextOnce(url);
  } catch (error) {
    const first = error instanceof Error ? error.message : String(error);
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      return await fetchTextOnce(url);
    } catch (second) {
      const msg = second instanceof Error ? second.message : String(second);
      throw new Error(`${msg}；重试前：${first}`);
    }
  }
}

function resolveUrl(base: string, ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  if (ref.startsWith('/')) {
    const u = new URL(base);
    return `${u.origin}${ref}`;
  }
  return new URL(ref, base).toString();
}

/** 拉播放列表，遇到 master playlist 就取第一个清晰度 */
export async function fetchPlaylist(url: string): Promise<string> {
  let text = await fetchText(url);
  if (!text.includes('#EXT-X-STREAM-INF')) return text;
  const sub = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));
  if (!sub) return text;
  text = await fetchText(resolveUrl(url, sub));
  return text;
}

/** 解析分片时长与 discontinuity 组边界 */
export function parsePlaylist(text: string): { segments: Segment[]; boundaries: number[] } {
  const segments: Segment[] = [];
  const boundaries = new Set<number>([0]);
  let pending = 0;
  let pendingBreak = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-DISCONTINUITY')) {
      pendingBreak = true;
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const value = Number.parseFloat(line.slice(8).split(',')[0] ?? '');
      pending = Number.isFinite(value) ? value : 0;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (pendingBreak) boundaries.add(segments.length);
    pendingBreak = false;
    segments.push({ dur: pending, uri: line });
  }
  const sorted = [...boundaries].filter((n) => n >= 0 && n <= segments.length).sort((a, b) => a - b);
  if ((sorted[sorted.length - 1] ?? -1) !== segments.length) sorted.push(segments.length);
  return { segments, boundaries: sorted };
}

/** 以组边界为格点，枚举 1–3 组的候选窗口 */
export function listCandidates(segments: Segment[], boundaries: number[]): Candidate[] {
  const out: Candidate[] = [];
  const groups: Array<[number, number]> = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i] ?? 0;
    const end = boundaries[i + 1] ?? start;
    if (end > start) groups.push([start, end]);
  }
  for (let i = 0; i < groups.length; i += 1) {
    for (let span = 1; span <= MAX_SPAN_GROUPS && i + span <= groups.length; span += 1) {
      const start = groups[i]?.[0] ?? 0;
      const end = groups[i + span - 1]?.[1] ?? start;
      if (span === groups.length) continue;
      const durs = segments.slice(start, end).map((s) => s.dur);
      if (!durs.length) continue;
      const total = durs.reduce((sum, n) => sum + n, 0);
      if (total < MIN_AD_SECONDS || total > MAX_AD_SECONDS) continue;
      const kind: 1 | 2 | 3 = start === 0 ? 1 : end === segments.length ? 3 : 2;
      out.push({ durs, totalMs: Math.round(total * 1000), kind, startIndex: start });
    }
  }
  return out;
}

export function signatureOf(durs: number[]): string {
  return durs.map((n) => n.toFixed(2)).join(',');
}

/**
 * 从该源随机抽 N 个有播放地址的作品。
 *
 * 不能用 `ORDER BY RAND() LIMIT N`：那会让 MySQL 全表扫 vod 再做 filesort，
 * 还要把 play_url（动辄几十 KB）一起塞进排序缓冲，61 万行级别的库上是 4 秒起步。
 * 改成「按主键区间取一小段 → 内存里随机挑 → 再按主键回表取 play_url」，三次往返即可。
 */
export async function pickSampleVods(db: Db, sourceId: number, size = SAMPLE_SIZE): Promise<SampleVod[]> {
  const picked: Array<{ id: number; vodId: number; name: string }> = [];
  const seen = new Set<number>();

  for (let attempt = 0; attempt < 6 && picked.length < size; attempt += 1) {
    const [range] = await db
      .select({ low: sql<number>`MIN(${vodPlay.id})`, high: sql<number>`MAX(${vodPlay.id})` })
      .from(vodPlay)
      .where(eq(vodPlay.sourceId, sourceId));
    const low = Number(range?.low ?? 0);
    const high = Number(range?.high ?? 0);
    if (high <= 0 || high <= low) break;

    /* 随机开一个窗口，取窗口内的一小段行（不带 play_url） */
    const width = Math.max(2000, Math.ceil((high - low) / 50));
    const start = low + Math.floor(Math.random() * Math.max(1, high - low - width));
    const rows = await db
      .select({ id: vodPlay.id, vodId: vodPlay.vodId, name: vod.name })
      .from(vodPlay)
      .innerJoin(vod, eq(vod.id, vodPlay.vodId))
      .where(
        and(
          eq(vodPlay.sourceId, sourceId),
          eq(vod.status, 1),
          isNotNull(vodPlay.playUrl),
          ne(vodPlay.playUrl, ''),
          gte(vodPlay.id, start),
          lte(vodPlay.id, start + width),
        ),
      )
      .orderBy(vodPlay.id)
      .limit(120);

    for (const row of rows) {
      if (picked.length >= size * 3) break;
      if (seen.has(row.vodId)) continue;
      seen.add(row.vodId);
      picked.push({ id: row.id, vodId: row.vodId, name: row.name });
    }
  }

  if (!picked.length) return [];

  /* 洗牌后取前 size 个，再回表拿 play_url */
  for (let i = picked.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = picked[i]!;
    picked[i] = picked[j]!;
    picked[j] = tmp;
  }
  const chosen = picked.slice(0, size);
  const urls = await db
    .select({ id: vodPlay.id, playUrl: vodPlay.playUrl })
    .from(vodPlay)
    .where(inArray(vodPlay.id, chosen.map((row) => row.id)));
  const urlMap = new Map<number, string>();
  for (const row of urls) urlMap.set(row.id, row.playUrl ?? '');

  const out: SampleVod[] = [];
  for (const row of chosen) {
    const playUrl = urlMap.get(row.id) ?? '';
    const first = playUrl.split('#')[0] ?? '';
    const url = first.split('$').pop() ?? '';
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ id: row.vodId, name: row.name, episode: '第 1 集', url });
  }
  return out;
}

/**
 * 分析一个采集源的广告特征：抽 10 部作品 → 组对齐滑窗 → 跨作品匹配 → 落库。
 * 只返回结论，日志由调用方拼接。
 */
export async function analyzeSource(
  db: Db,
  sourceId: number,
  log: (line: string) => void,
): Promise<{ features: FoundFeature[]; sampled: number }> {
  const samples = await pickSampleVods(db, sourceId);
  log(`随机抽取 ${samples.length} 部作品用于提取特征`);
  if (!samples.length) return { features: [], sampled: 0 };

  const map = new Map<
    string,
    {
      durs: number[];
      totalMs: number;
      kind: 1 | 2 | 3;
      hits: Map<number, { name: string; start: number; url: string; startSec: number }>;
    }
  >();

  log(`并发拉取 ${samples.length} 部作品的播放列表…`);
  const jobs = samples.map(async (sample) => {
    try {
      const text = await fetchPlaylist(sample.url);
      const { segments, boundaries } = parsePlaylist(text);
      const candidates = listCandidates(segments, boundaries);
      log(`${sample.name}：${segments.length} 段 / ${candidates.length} 个候选`);
      return { sample, segments, candidates, error: '' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`${sample.name}：解析失败（${msg}）`);
      return { sample, segments: [], candidates: [], error: msg };
    }
  });
  const results = await Promise.all(jobs);

  let parsed = 0;
  for (const result of results) {
    const { sample } = result;
    if (result.error) continue;
    parsed += 1;
    for (const candidate of result.candidates) {
      const key = signatureOf(candidate.durs);
      let startSec = 0;
      for (let i = 0; i < candidate.startIndex && i < result.segments.length; i += 1) {
        const seg = result.segments[i];
        if (seg) startSec += seg.dur;
      }
      const record = {
        name: sample.name,
        start: candidate.startIndex,
        url: sample.url,
        startSec: Math.round(startSec * 100) / 100,
      };
      const hit = map.get(key);
      if (hit) hit.hits.set(sample.id, record);
      else {
        map.set(key, {
          durs: candidate.durs,
          totalMs: candidate.totalMs,
          kind: candidate.kind,
          hits: new Map([[sample.id, record]]),
        });
      }
    }
  }

  if (parsed === 0) {
    log('全部作品都拉取失败：通常是源站按 IP 或 UA 拦截（403），或这批片的第一集地址已失效');
    return { features: [], sampled: samples.length };
  }
  if (parsed < samples.length) {
    log(`${samples.length - parsed} 部作品拉取失败，已跳过，仅用成功的 ${parsed} 部参与比对`);
  }

  const minHits = 4;
  const found: FoundFeature[] = [];
  for (const [key, value] of map) {
    if (value.hits.size < minHits) continue;
    found.push({
      durations: key,
      totalMs: value.totalMs,
      kind: value.kind,
      hitVods: value.hits.size,
      sample: [...value.hits.entries()].slice(0, 3).map(([vodId, hit]) => ({
        vod_id: vodId,
        vod_name: hit.name,
        start: hit.start,
        start_sec: hit.startSec,
        url: hit.url,
      })),
    });
  }
  found.sort((a, b) => b.hitVods - a.hitVods || b.totalMs - a.totalMs);
  const top = found.slice(0, 50);

  log(`命中 ${top.length} 条候选（至少出现在 ${minHits}/${parsed} 部作品中），等待人工确认`);
  return { features: top, sampled: samples.length };
}
