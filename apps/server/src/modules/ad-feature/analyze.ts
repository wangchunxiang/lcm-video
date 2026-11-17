import { episodeLabel, fetchText, parsePlayUrl } from '@lcm/shared';
import type { DataSource } from 'typeorm';

/** 一次分析抽多少个作品 */
export const SAMPLE_SIZE = 10;

/** 选片的时间范围，按 `lcm_vod.collected_at`（最后一次采集/更新时间）判断 */
export type PickRange = 'all' | 'day' | 'week' | 'month';

/**
 * 范围起点：从现在往前推（本日 = 最近 24 小时，本周 = 最近 7 天，本月 = 最近 1 个月），
 * 不是自然日/自然周。用 SQL 表达式算，不在 JS 里拼日期：库会话时区固定 +08:00，
 * `NOW()` 的语义就是本地时间。这些字符串是常量，没有用户输入拼接。
 */
const RANGE_SINCE = {
  day: 'NOW() - INTERVAL 1 DAY',
  week: 'NOW() - INTERVAL 7 DAY',
  month: 'NOW() - INTERVAL 1 MONTH',
} satisfies Record<Exclude<PickRange, 'all'>, string>;

/** 一段候选广告的最短 / 最长时长（秒），超过 30 秒的不当作广告 */
const MIN_AD_SECONDS = 6;
const MAX_AD_SECONDS = 30;
/** 一个候选最多跨几个 discontinuity 组 */
const MAX_SPAN_GROUPS = 3;
/** 至少要在多少个作品里同时出现，才算广告特征 */
const MIN_HITS = 4;

export interface SampleVod {
  /** 影片 id（BIGINT，字符串） */
  id: string;
  name: string;
  episode: string;
  url: string;
}

/** 抽中的候选：线路主键 + 所属作品（有名字说明作品上架） */
interface PickedPlay {
  id: string;
  vodId: string;
  name: string;
}

function shuffleInPlace<T>(list: T[]): void {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
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
  sample: Array<{ vod_id: string; vod_name: string; start: number; start_sec: number; url: string }>;
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
 * 从该源随机抽 N 个有播放地址的作品，可选限定作品的最新更新时间范围。
 *
 * 不用 `ORDER BY RAND()`：那要全表扫 vod 再 filesort，还得把动辄几十 KB 的
 * play_url 塞进排序缓冲。改为「随机起点向后取一段 → 内存洗牌 → 按主键回表取
 * play_url」，几次往返即可。
 *
 * 主键是 BIGINT UNSIGNED（驱动按字符串返回）：区间计算用 Number()，回传 SQL 前
 * 一律 String()。
 */
export async function pickSampleVods(
  dataSource: DataSource,
  sourceId: string,
  size = SAMPLE_SIZE,
  range: PickRange = 'all',
): Promise<SampleVod[]> {
  const picked =
    range === 'all'
      ? await pickByPlayRows(dataSource, sourceId, size)
      : await pickByVodRange(dataSource, sourceId, size, range);

  if (!picked.length) return [];

  /* 洗牌后逐个取，直到凑够 size 个「有播放地址」的；地址为空的跳过，不占名额 */
  shuffleInPlace(picked);
  const urls = await dataSource.query<Array<{ id: string; playUrl: string | null }>>(
    'SELECT id, play_url AS playUrl FROM lcm_vod_play WHERE id IN (?)',
    [picked.map((row) => row.id)],
  );
  const urlMap = new Map<string, string>();
  for (const row of urls) urlMap.set(row.id, row.playUrl ?? '');

  const out: SampleVod[] = [];
  for (const row of picked) {
    if (out.length >= size) break;
    const playUrl = urlMap.get(row.id) ?? '';
    /* 一条线路可能有几十集：取最后一集（最新那集），更能反映当前的广告情况 */
    const episodes = parsePlayUrl(playUrl);
    const lastIndex = episodes.length - 1;
    const last = episodes[lastIndex];
    if (!last) continue;
    const url = last.url;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ id: row.vodId, name: row.name, episode: episodeLabel(last, lastIndex), url });
  }
  return out;
}

/**
 * 不限时间范围：直接在 `lcm_vod_play` 上随机起点向后取一段行。
 *
 * 起点向后取（而不是「随机开一个固定宽度的窗口」）：各源的线路 id 分布很不均匀，
 * 固定窗口会大量落在空档里，抽不满 N 个。撞到尾段时从最小 id 再补一次。
 */
async function pickByPlayRows(
  dataSource: DataSource,
  sourceId: string,
  size: number,
): Promise<PickedPlay[]> {
  const picked: PickedPlay[] = [];
  const seen = new Set<string>();

  /** 从 from 起向后取一段行（不带 play_url，省 IO） */
  const fetchFrom = (from: number): Promise<Array<{ id: string; vodId: string }>> =>
    dataSource.query<Array<{ id: string; vodId: string }>>(
      `SELECT id, vod_id AS vodId
         FROM lcm_vod_play
        WHERE source_id = ?
          AND play_url <> ''
          AND id >= ?
        ORDER BY id ASC
        LIMIT 120`,
      [sourceId, String(from)],
    );

  for (let attempt = 0; attempt < 8 && picked.length < size * 3; attempt += 1) {
    const [range] = await dataSource.query<Array<{ low: string; high: string }>>(
      `SELECT COALESCE(CAST(MIN(id) AS CHAR), '0') AS low,
              COALESCE(CAST(MAX(id) AS CHAR), '0') AS high
         FROM lcm_vod_play
        WHERE source_id = ?`,
      [sourceId],
    );
    const low = Number(range?.low ?? 0);
    const high = Number(range?.high ?? 0);
    if (high <= 0) break;

    /* 随机起点向后取 120 行；不足 60 行说明撞到尾段，再从最小 id 补一次（绕回） */
    const start = low + Math.floor(Math.random() * Math.max(1, high - low + 1));
    const rows = await fetchFrom(start);
    if (rows.length < 60) rows.push(...(await fetchFrom(low)));
    if (!rows.length) continue;

    // 没有物理外键也没有 relation，状态过滤要单独查一次（最多 240 个 id，代价很小）
    const vods = await dataSource.query<Array<{ id: string; name: string }>>(
      'SELECT id, name FROM lcm_vod WHERE status = 1 AND id IN (?)',
      [[...new Set(rows.map((row) => row.vodId))]],
    );
    const nameMap = new Map<string, string>();
    for (const item of vods) nameMap.set(item.id, item.name);

    for (const row of rows) {
      if (picked.length >= size * 3) break;
      if (seen.has(row.vodId)) continue;
      const name = nameMap.get(row.vodId);
      if (!name) continue;
      seen.add(row.vodId);
      picked.push({ id: row.id, vodId: row.vodId, name });
    }
  }

  return picked;
}

/**
 * 指定时间范围：先在 `lcm_vod` 上按 `collected_at` 过滤，随机起点向后取一段作品，
 * 再回查这些作品在该源的线路。
 */
async function pickByVodRange(
  dataSource: DataSource,
  sourceId: string,
  size: number,
  range: Exclude<PickRange, 'all'>,
): Promise<PickedPlay[]> {
  const since = RANGE_SINCE[range];
  const picked: PickedPlay[] = [];
  const seen = new Set<string>();

  for (let attempt = 0; attempt < 8 && picked.length < size * 3; attempt += 1) {
    const [bounds] = await dataSource.query<Array<{ low: string; high: string }>>(
      `SELECT COALESCE(CAST(MIN(id) AS CHAR), '0') AS low,
              COALESCE(CAST(MAX(id) AS CHAR), '0') AS high
         FROM lcm_vod
        WHERE status = 1
          AND collected_at >= ${since}`,
    );
    const low = Number(bounds?.low ?? 0);
    const high = Number(bounds?.high ?? 0);
    if (high <= 0) break; // 该范围内没有上架作品

    const start = low + Math.floor(Math.random() * Math.max(1, high - low + 1));
    const vods = await dataSource.query<Array<{ id: string; name: string }>>(
      `SELECT id, name
         FROM lcm_vod
        WHERE status = 1
          AND collected_at >= ${since}
          AND id >= ?
        ORDER BY id ASC
        LIMIT 200`,
      [String(start)],
    );
    const fresh = vods.filter((row) => !seen.has(row.id));
    if (!fresh.length) continue;

    /* 一部作品在该源可能有多条线路，每个作品只留第一条用过的 */
    const plays = await dataSource.query<Array<{ id: string; vodId: string }>>(
      `SELECT id, vod_id AS vodId
         FROM lcm_vod_play
        WHERE source_id = ?
          AND play_url <> ''
          AND vod_id IN (?)
        ORDER BY id ASC`,
      [sourceId, fresh.map((row) => row.id)],
    );
    const nameMap = new Map<string, string>(fresh.map((row) => [row.id, row.name]));

    for (const play of plays) {
      if (picked.length >= size * 3) break;
      if (seen.has(play.vodId)) continue;
      const name = nameMap.get(play.vodId);
      if (!name) continue;
      seen.add(play.vodId);
      picked.push({ id: play.id, vodId: play.vodId, name });
    }
  }

  return picked;
}

/**
 * 分析一个采集源的广告特征：抽 10 部作品 → 组对齐滑窗 → 跨作品匹配。
 * 只返回结论，日志由调用方拼接。
 */
export async function analyzeSource(
  dataSource: DataSource,
  sourceId: string,
  log: (line: string) => void,
  provided?: SampleVod[],
  range: PickRange = 'all',
): Promise<{ features: FoundFeature[]; sampled: number }> {
  const samples =
    provided && provided.length > 0
      ? provided
      : await pickSampleVods(dataSource, sourceId, SAMPLE_SIZE, range);
  log(
    provided && provided.length > 0
      ? `使用页面选定的 ${samples.length} 部作品`
      : `随机抽取 ${samples.length} 部作品用于提取特征`,
  );
  if (!samples.length) return { features: [], sampled: 0 };

  const map = new Map<
    string,
    {
      durs: number[];
      totalMs: number;
      kind: 1 | 2 | 3;
      hits: Map<string, { name: string; start: number; url: string; startSec: number }>;
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
      return { sample, segments: [] as Segment[], candidates: [] as Candidate[], error: msg };
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

  const found: FoundFeature[] = [];
  for (const [key, value] of map) {
    if (value.hits.size < MIN_HITS) continue;
    found.push({
      durations: key,
      totalMs: value.totalMs,
      kind: value.kind,
      hitVods: value.hits.size,
      /* 命中样例全留：最多 10 条（只抽 10 部），弹窗里能逐个点开听定位 */
      sample: [...value.hits.entries()].map(([vodId, hit]) => ({
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

  log(`命中 ${top.length} 条候选（至少出现在 ${MIN_HITS}/${parsed} 部作品中），等待人工确认`);
  return { features: top, sampled: samples.length };
}
