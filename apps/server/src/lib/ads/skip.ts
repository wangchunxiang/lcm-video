import { eq } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { adFeature } from '@lcm/db';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** 时长比对容差（秒），源站同一支广告的分片时长是固定的，2% 以内视为一致 */
const TOLERANCE = 0.03;

interface Segment {
  dur: number;
  uri: string;
  tags: string[];
}

function absolutize(base: string, uri: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 解析播放列表正文，返回头部标签与分片；遇到 master playlist 返回 null */
function parseMedia(text: string): { head: string[]; segments: Segment[] } | null {
  if (text.includes('#EXT-X-STREAM-INF')) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const head: string[] = [];
  const segments: Segment[] = [];
  let tags: string[] = [];
  let dur: number | null = null;
  let started = false;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#')) {
      if (!started && !line.startsWith('#EXTINF')) {
        head.push(line);
        continue;
      }
      if (line.startsWith('#EXTINF')) {
        dur = Number.parseFloat(line.slice('#EXTINF:'.length)) || 0;
        started = true;
        continue;
      }
      tags.push(line);
      continue;
    }
    segments.push({ dur: dur ?? 0, uri: line, tags });
    tags = [];
    dur = null;
  }
  return { head, segments };
}

/** 在时长序列里标出所有命中广告特征的分片 */
function markAds(durations: number[], patterns: number[][]): boolean[] {
  const isAd = new Array<boolean>(durations.length).fill(false);
  for (const pattern of patterns) {
    if (!pattern.length || pattern.length > durations.length) continue;
    for (let start = 0; start + pattern.length <= durations.length; start += 1) {
      let hit = true;
      for (let offset = 0; offset < pattern.length; offset += 1) {
        const expected = pattern[offset] ?? 0;
        const actual = durations[start + offset] ?? 0;
        if (Math.abs(actual - expected) > TOLERANCE) {
          hit = false;
          break;
        }
      }
      if (!hit) continue;
      for (let offset = 0; offset < pattern.length; offset += 1) isAd[start + offset] = true;
    }
  }
  return isAd;
}

const CACHE_TTL = 60_000;
const cache = new Map<string, { at: number; text: string }>();

async function fetchCached(url: string): Promise<string> {
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL) return hit.text;
  const text = await fetchText(url);
  if (cache.size > 200) cache.clear();
  cache.set(url, { at: now, text });
  return text;
}

export interface CleanResult {
  text: string;
  removed: number;
  total: number;
}

/**
 * 拉取上游播放列表，按该源已确认的广告特征剔除对应分片。
 * 没有命中广告时返回 null，调用方直接用原始地址。
 */
export async function cleanPlaylist(db: Db, sourceId: number, url: string): Promise<CleanResult | null> {
  const rows = await db
    .select({ durations: adFeature.durations })
    .from(adFeature)
    .where(eq(adFeature.sourceId, sourceId));
  const patterns = rows
    .map((row) => row.durations.split(',').map((item) => Number.parseFloat(item) || 0))
    .filter((pattern) => pattern.length > 0 && pattern.every((item) => item > 0));
  if (!patterns.length) return null;

  let base = url;
  let text = await fetchCached(url);

  if (text.includes('#EXT-X-STREAM-INF')) {
    const variant = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    if (!variant) return null;
    base = absolutize(url, variant);
    text = await fetchCached(base);
  }

  const parsed = parseMedia(text);
  if (!parsed || parsed.segments.length === 0) return null;

  const durations = parsed.segments.map((segment) => segment.dur);
  const isAd = markAds(durations, patterns);
  const removed = isAd.filter(Boolean).length;
  if (removed === 0) return null;

  const output: string[] = [...parsed.head];
  // 删掉一段分片后，时间轴会往前跳，必须在接缝处补一个 discontinuity，
  // 否则播放器会把这个跳变当成连续数据，声音在接缝处会爆音。
  let removedRun = false;
  parsed.segments.forEach((segment, index) => {
    if (isAd[index]) {
      removedRun = true;
      return;
    }
    const hasDiscontinuity = segment.tags.some((tag) => tag.startsWith('#EXT-X-DISCONTINUITY'));
    for (const tag of segment.tags) {
      if (tag.startsWith('#EXT-X-DISCONTINUITY')) continue;
      output.push(tag);
    }
    if (hasDiscontinuity || removedRun) output.push('#EXT-X-DISCONTINUITY');
    removedRun = false;
    output.push(`#EXTINF:${segment.dur.toFixed(6)},`);
    output.push(absolutize(base, segment.uri));
  });
  if (!output.includes('#EXT-X-ENDLIST')) output.push('#EXT-X-ENDLIST');

  return { text: `${output.join('\n')}\n`, removed, total: parsed.segments.length };
}
