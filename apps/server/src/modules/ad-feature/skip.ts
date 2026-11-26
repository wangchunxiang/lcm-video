import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { FETCH_UA } from '@lcm/shared';
import type { DataSource } from 'typeorm';

/** 时长比对容差（秒），源站同一支广告的分片时长是固定的，3% 以内视为一致 */
export const TOLERANCE = 0.03;

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

/**
 * 整段正文逐行绝对化：标签里的 URI 和分片/variant 的相对路径都按真正被拉取的地址解析。
 * 透传原文时走这里，否则播放器会把 `seg-1.ts` 解析成本站域名下的路径，整片 404。
 */
function absolutizeBody(text: string, base: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      return trimmed.startsWith('#') ? absolutizeTags(trimmed, base) : absolutize(base, trimmed);
    })
    .join('\n');
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
/**
 * 默认的整段预算（不是单次超时）。源站的 m3u8 前面挂了 Cloudflare 跳转，
 * 实测同一个地址 0.4s ~ 19s 都有（西瓜资源），单次超时给多少都会被撞上；
 * 所以改成「总预算 + 后台预热」：
 * - 播放请求只等一小段（调用方传 budgetMs），拿不到就向上报错（502），绝不让首屏卡住；
 * - 预热用大预算把 master / 变体都塞进缓存，下一次播放直接毫秒级命中。
 */
const FETCH_TIMEOUT_MS = 20_000;

/**
 * 软 TTL：这个时间之内直接命中，不发任何上游请求。
 * 源站同一集的播放列表在几分钟内不会变，60 秒是“够短不至于拿到旧地址、够长能覆盖连看”的值。
 */
const CACHE_TTL = 60_000;
/**
 * 硬 TTL（stale-while-revalidate 的上限）：超过软 TTL 但没过硬 TTL 的条目仍然直接返回，
 * 同时在后台刷新。用户不必为一份已经能播的播放列表再等一次源站。
 * 之所以还要上限：源站换 CDN 路径后，旧正文里的分片可能已经 404，真切得有个期限。
 */
const CACHE_STALE_TTL = 10 * 60_000;
/**
 * 缓存条目上限。超过就按插入顺序淘汰最旧的一条。
 * 以前是 `cache.clear()`：全清会让下一批请求全部穿透，高峰期直接形成尖刺。
 */
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; text: string }>();
/** 同一个地址的并发拉取只发一次；预热与播放请求撞上时共用同一个 promise */
const inFlight = new Map<string, Promise<string>>();
/**
 * 上游自身的失败（超时、非 2xx、空响应、体积超限、跳转成环）。
 * 单独成类是为了让调用方能把「源站抽风」（报 502，让用户换线路）和
 * 「我们自己的 bug」（留成 500，日志里能看见真实堆栈）分开。
 */
export class UpstreamPlaylistError extends Error {}

/** 给一个 promise 套调用方自己的预算；超时只影响这次调用，底层的拉取照旧跑完并回填缓存 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new UpstreamPlaylistError('拉取上游播放列表超时')),
      Math.max(500, timeoutMs),
    );
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
/**
 * 上游播放列表体积上限：正常点播列表也就几十 KB，超过这个数说明不是能直出的 m3u8。
 * 有了上限，透传分支才不会把本站变成放大别人响应的通道。
 */
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

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
            reject(new UpstreamPlaylistError('跳转层数过多'));
            return;
          }
          resolve(requestText(next, timeoutMs, depth + 1));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new UpstreamPlaylistError(`HTTP ${status}`));
          return;
        }
        let body = '';
        /* 体积上限按字节计：`body.length` 是 UTF-16 码元数，与常量名/注释对不上 */
        let bytes = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
          bytes += Buffer.byteLength(chunk);
          if (bytes > MAX_PLAYLIST_BYTES) {
            reject(new UpstreamPlaylistError('上游播放列表过大'));
            req.destroy();
          }
        });
        res.on('end', () => {
          if (!body.trim()) reject(new UpstreamPlaylistError('响应为空'));
          else resolve(body);
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new UpstreamPlaylistError('拉取上游播放列表超时')));
    // 连接层的错误（ECONNRESET / ETIMEDOUT / EPROTO）也是上游的事，统一归类
    req.on('error', (error: Error) => reject(new UpstreamPlaylistError(error.message)));
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

/** 写缓存并按插入顺序淘汰：Map 的迭代顺序就是写入顺序，最前面的最旧 */
function remember(url: string, text: string): void {
  cache.delete(url);
  cache.set(url, { at: Date.now(), text });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    cache.delete(oldest.value);
  }
}

/** 命中时也为它续一位：常用条目不该因为"写得早"被淘汰 */
function promote(url: string, entry: { at: number; text: string }): void {
  cache.delete(url);
  cache.set(url, entry);
}

/**
 * 拉一次并回填缓存；同一个地址的并发拉取只发一次（在途去重）。
 * 预热与播放请求撞上时共用同一个 promise，各自只按自己的预算等待，不会把源站拉两遍。
 */
function load(url: string): Promise<string> {
  let task = inFlight.get(url);
  if (task === undefined) {
    task = fetchUpstream(url, FETCH_TIMEOUT_MS)
      .then((text) => {
        remember(url, text);
        return text;
      })
      .finally(() => {
        inFlight.delete(url);
      });
    inFlight.set(url, task);
  }
  return task;
}

/**
 * 带缓存的拉取：新鲜的直接给，过期的先给旧的再后台刷新，真没有才等上游。
 *
 * 为什么 stale 也要给：用户点开播放页时，一份 3 分钟前的播放列表完全能看，
 * 而等源站可能要十几秒——这正是开头「起播慢」的主因。后台刷新失败不影响本次播放，
 * 旧正文继续用到硬 TTL 为止。
 */
async function fetchCached(url: string, timeoutMs: number): Promise<string> {
  const hit = cache.get(url);
  if (hit !== undefined) {
    const age = Date.now() - hit.at;
    if (age < CACHE_TTL) {
      promote(url, hit);
      return hit.text;
    }
    if (age < CACHE_STALE_TTL) {
      promote(url, hit);
      // 已有一个在途请求就不重复发；刷新失败只当没刷到，不向调用方报错
      if (!inFlight.has(url)) void load(url).catch(() => undefined);
      return hit.text;
    }
  }
  return withTimeout(load(url), timeoutMs);
}


export interface CleanResult {
  text: string;
  removed: number;
  total: number;
}

/**
 * 拉取上游播放列表，按该源已确认的广告特征剔除对应分片。
 *
 * 无论有没有命中广告，都返回可以直出给播放器的正文：命中时是删减版，没命中时是
 * 逐行绝对化后的原文（master 就是 master，不下钻成单条变体，否则自适应码率会丢）。
 * 只有上游自身失败才抛 `UpstreamPlaylistError`（由调用方报 502）；其它错误原样上抛。
 * 这样播放器不必再跟一次 302 —— Apple 原生播放器对 media 请求的重定向很脆弱。
 */
export async function cleanPlaylist(
  dataSource: DataSource,
  sourceId: string,
  url: string,
  budgetMs = FETCH_TIMEOUT_MS,
): Promise<CleanResult> {
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

  /* 拉到的原文与它自己的基准地址：透传时必须原样（绝对化后）吐回去 */
  const originalBase = url;
  const originalText = await fetchCached(url, remaining());
  /* 透传原文：不动结构，只把相对地址改成绝对地址 */
  const passthrough = (total: number): CleanResult => ({
    text: absolutizeBody(originalText, originalBase),
    removed: 0,
    total,
  });

  if (!patterns.length) return passthrough(0);

  let base = originalBase;
  let text = originalText;
  let parsed = parseMedia(text);
  /*
   * master 只在真要删分片时才下钻到变体：透传分支必须把 master 原样交回去，
   * 否则播放器拿到的是一条钉死的变体（通常是最低码率），自适应码率与
   * `#EXT-X-MEDIA` 分离音轨都会丢。下钻失败就退回 master，不把整条线路判死。
   */
  if (text.includes('#EXT-X-STREAM-INF')) {
    const variant = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    if (variant === undefined) return passthrough(0);
    const variantUrl = absolutize(url, variant);
    try {
      const variantText = await fetchCached(variantUrl, remaining());
      const variantParsed = parseMedia(variantText);
      if (!variantParsed || variantParsed.segments.length === 0) return passthrough(0);
      base = variantUrl;
      text = variantText;
      parsed = variantParsed;
    } catch {
      return passthrough(0);
    }
  }

  if (!parsed || parsed.segments.length === 0) return passthrough(0);

  const durations = parsed.segments.map((segment) => segment.dur);
  const isAd = markAds(durations, patterns);
  const removed = isAd.filter(Boolean).length;
  if (removed === 0) return passthrough(parsed.segments.length);

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
