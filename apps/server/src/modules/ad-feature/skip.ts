import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { FETCH_UA } from '@lcm/shared';
import type { DataSource } from 'typeorm';

/** 时长比对容差（秒），源站同一支广告的分片时长是固定的，3% 以内视为一致 */
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

/**
 * 标签里的 URI 也要转绝对地址。
 * AES-128 的 #EXT-X-KEY 常写成相对路径，原样返回给播放器时会被解析成本站域名
 * 下的路径，请求 404，解密失败就整条不给播。
 */
function absolutizeTags(tag: string, base: string): string {
  if (!tag.includes('URI="')) return tag;
  return tag.replace(/URI="([^"]*)"/g, (_match, uri: string) => `URI="${absolutize(base, uri)}"`);
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
/**
 * 默认的整段预算（不是单次超时）。源站的 m3u8 前面挂了 Cloudflare 跳转，
 * 实测同一个地址 0.4s ~ 19s 都有（西瓜资源），单次超时给多少都会被撞上；
 * 所以改成「总预算 + 后台预热」：
 * - 播放请求只等一小段（调用方传 budgetMs），拿不到就 302 回源，绝不让首屏卡住；
 * - 预热用大预算把 master / 变体都塞进缓存，下一次播放直接毫秒级命中。
 */
const FETCH_TIMEOUT_MS = 20_000;
const cache = new Map<string, { at: number; text: string }>();
/** 同一个地址的并发拉取只发一次；预热与播放请求撞上时共用同一个 promise */
const inFlight = new Map<string, Promise<string>>();

/** 给一个 promise 套调用方自己的预算；超时只影响这次调用，底层的拉取照旧跑完并回填缓存 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('拉取上游播放列表超时')), Math.max(500, timeoutMs));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * 源站 302 的目标缓存。
 *
 * 西瓜资源实测：`svip.xgplay20.com`（Cloudflare 跳转那一跳）要 0.4~19 秒，
 * 而 302 之后的 `vip20.jimxtc.com` 只要 50 毫秒。`fetch` 每次都在慢域名上重走一遍，
 * 还会撞上 undici 默认 10 秒的**连接超时**（表现为 `fetch failed`）。
 * 这里自己跟跳转：记下「源站域名 → 最终地址」，下次直接把 host 换成目标、路径与 query 保留；
 * 目标失效时回退原地址并清掉记录。
 */
const REDIRECT_TTL = 10 * 60_000;
const redirectCache = new Map<string, { at: number; target: string }>();
/** 跳转最多跟几层，防止源站互相指 */
const MAX_REDIRECTS = 4;

function rewriteWithRedirect(url: string): string | null {
  try {
    const source = new URL(url);
    const hit = redirectCache.get(source.host);
    if (hit === undefined) return null;
    if (Date.now() - hit.at > REDIRECT_TTL) {
      redirectCache.delete(source.host);
      return null;
    }
    const target = new URL(hit.target);
    return `${target.origin}${source.pathname}${source.search}`;
  } catch {
    return null;
  }
}

function rememberRedirect(fromUrl: string, toUrl: string): void {
  try {
    const source = new URL(fromUrl);
    const target = new URL(toUrl, fromUrl);
    if (source.host === target.host) return;
    redirectCache.set(source.host, { at: Date.now(), target: target.toString() });
  } catch {
    /* 解析不了就不记 */
  }
}

/**
 * 用 `node:https` 而不是 `fetch`：undici 的连接超时固定 10 秒，而这个源站的第一跳
 * 经常要 9~19 秒才建连，`fetch` 会直接失败。自己发请求则只受调用方给的预算约束，
 * 顺便把跨域跳转的目标记进 `redirectCache`。
 */
function requestText(url: string, timeoutMs: number, depth = 0): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const client = url.startsWith('https:') ? httpsGet : httpGet;
    const req = client(
      url,
      { headers: { 'user-agent': FETCH_UA, accept: '*/*' }, timeout: Math.max(500, timeoutMs) },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location !== undefined) {
          res.resume();
          const next = new URL(location, url).toString();
          rememberRedirect(url, next);
          if (depth >= MAX_REDIRECTS) {
            reject(new Error('跳转层数过多'));
            return;
          }
          resolve(requestText(next, timeoutMs, depth + 1));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          if (!body.trim()) reject(new Error('响应为空'));
          else resolve(body);
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('拉取上游播放列表超时')));
    req.on('error', reject);
  });
}

/** 拉一次：优先用缓存的跳转目标直连，失败再回到原地址 */
async function fetchUpstream(url: string, timeoutMs: number): Promise<string> {
  const rewritten = rewriteWithRedirect(url);
  if (rewritten !== null) {
    try {
      return await requestText(rewritten, timeoutMs);
    } catch {
      const source = new URL(url);
      redirectCache.delete(source.host);
    }
  }
  return requestText(url, timeoutMs);
}

async function fetchCached(url: string, timeoutMs: number): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.text;

  /*
   * 同一个地址的拉取只发一次（在途去重）：预热与播放请求撞上时共用同一个 promise，
   * 各自只按自己的预算等待，谁也不会把源站拉两遍。
   */
  let task = inFlight.get(url);
  if (task === undefined) {
    task = fetchUpstream(url, FETCH_TIMEOUT_MS)
      .then((text) => {
        if (cache.size > 200) cache.clear();
        cache.set(url, { at: Date.now(), text });
        return text;
      })
      .finally(() => {
        inFlight.delete(url);
      });
    inFlight.set(url, task);
  }
  return withTimeout(task, timeoutMs);
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
export async function cleanPlaylist(
  dataSource: DataSource,
  sourceId: string,
  url: string,
  budgetMs = FETCH_TIMEOUT_MS,
): Promise<CleanResult | null> {
  /* 整段预算：master 与变体两次拉取共用，谁先耗完谁超时 */
  const deadline = Date.now() + budgetMs;
  const remaining = (): number => deadline - Date.now();
  const rows = await dataSource.query<Array<{ durations: string }>>(
    'SELECT durations FROM lcm_ad_feature WHERE source_id = ?',
    [sourceId],
  );
  const patterns = rows
    .map((row) => row.durations.split(',').map((item) => Number.parseFloat(item) || 0))
    .filter((pattern) => pattern.length > 0 && pattern.every((item) => item > 0));
  if (!patterns.length) return null;

  let base = url;
  let text = await fetchCached(url, remaining());

  if (text.includes('#EXT-X-STREAM-INF')) {
    const variant = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    if (!variant) return null;
    base = absolutize(url, variant);
    text = await fetchCached(base, remaining());
  }

  const parsed = parseMedia(text);
  if (!parsed || parsed.segments.length === 0) return null;

  const durations = parsed.segments.map((segment) => segment.dur);
  const isAd = markAds(durations, patterns);
  const removed = isAd.filter(Boolean).length;
  if (removed === 0) return null;

  const output: string[] = parsed.head.map((tag) => absolutizeTags(tag, base));
  // 删掉一段分片后时间轴会往前跳，必须在接缝处补一个 discontinuity，
  // 否则播放器会把这个跳变当成连续数据，接缝处会爆音。
  let removedRun = false;
  parsed.segments.forEach((segment, index) => {
    if (isAd[index]) {
      removedRun = true;
      return;
    }
    const hasDiscontinuity = segment.tags.some((tag) => tag.startsWith('#EXT-X-DISCONTINUITY'));
    for (const tag of segment.tags) {
      if (tag.startsWith('#EXT-X-DISCONTINUITY')) continue;
      output.push(absolutizeTags(tag, base));
    }
    if (hasDiscontinuity || removedRun) output.push('#EXT-X-DISCONTINUITY');
    removedRun = false;
    output.push(`#EXTINF:${segment.dur.toFixed(6)},`);
    output.push(absolutize(base, segment.uri));
  });
  if (!output.includes('#EXT-X-ENDLIST')) output.push('#EXT-X-ENDLIST');

  return { text: `${output.join('\n')}\n`, removed, total: parsed.segments.length };
}
