import { hostOf } from '@lcm/shared';
import type { DataSource } from 'typeorm';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/** 体检图片时带的 Referer：与浏览器从本站加载图片的行为一致，否则防盗链会误判失效 */
const PAGE_REFERER = 'https://www.lcm-video.com/';

/** 每个域名抽几张 */
const SAMPLE_COUNT = 2;
/** 同一域名两次图片请求之间的间隔 */
const SAMPLE_INTERVAL_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type ProbeResult = {
  ok: boolean;
  message: string;
  /** 失败原因是网络不通，而不是图床拒绝 */
  network: boolean;
};

export type CheckResult = {
  host: string;
  ok: boolean;
  /** 1 正常 2 失效 3 无法验证（服务器网络访问不到，不代表图片不可用） */
  status: 1 | 2 | 3;
  okCount: number;
  failCount: number;
  message: string;
};

/** 每个域名上次图片请求结束的时刻 */
const lastProbeAt = new Map<string, number>();
/** 每个域名一条串行队列，保证同一域名的探测不会同时发出 */
const hostQueues = new Map<string, Promise<unknown>>();

/** 同一域名两次图片请求之间至少间隔 3 秒 */
async function withHostThrottle<T>(host: string, run: () => Promise<T>): Promise<T> {
  if (lastProbeAt.size > 500) {
    const cutoff = Date.now() - 60_000;
    for (const [key, at] of lastProbeAt) if (at < cutoff) lastProbeAt.delete(key);
  }
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const next = previous.then(async () => {
    const wait = SAMPLE_INTERVAL_MS - (Date.now() - (lastProbeAt.get(host) ?? 0));
    if (wait > 0) await sleep(wait);
    try {
      return await run();
    } finally {
      lastProbeAt.set(host, Date.now());
    }
  });
  hostQueues.set(
    host,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** 探测一张图片是否可访问：先 HEAD，失败再退回 GET 取首字节（有的图床不支持 HEAD） */
export async function probeImage(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  if (!url) return { ok: false, message: '地址为空', network: false };
  const head = await request(url, 'HEAD', timeoutMs);
  if (head.ok) return head;
  const get = await request(url, 'GET', timeoutMs, { Range: 'bytes=0-1023' });
  return get.ok ? get : head;
}

async function request(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  extra: Record<string, string> = {},
): Promise<ProbeResult> {
  const host = hostOf(url);
  if (!host) return requestOnce(url, method, timeoutMs, extra);
  return withHostThrottle(host, () => requestOnce(url, method, timeoutMs, extra));
}

async function requestOnce(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  extra: Record<string, string>,
): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8', referer: PAGE_REFERER, ...extra },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}`, network: false };
    if (!type.startsWith('image/')) return { ok: false, message: `返回 ${type || '未知类型'}，不是图片`, network: false };
    if (method === 'GET') await response.body?.cancel();
    return { ok: true, message: '正常', network: false };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, message: '连接超时', network: true };
    const reason = error instanceof Error ? error.message : String(error);
    if (/ENOTFOUND|getaddrinfo/.test(reason)) return { ok: false, message: 'DNS 解析失败', network: true };
    return { ok: false, message: `连接失败：${reason.slice(0, 80)}`, network: true };
  }
}

/** 域名统一口径：小写、去端口（与 `hostOf()` 对 cover 的结果对齐） */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '');
}

/** 检查单个域名：抽 2 张，同一域名内两次请求间隔 3 秒 */
export async function checkHost(dataSource: DataSource, host: string): Promise<CheckResult> {
  const rows = await dataSource.query<Array<{ cover: string }>>(
    'SELECT cover FROM lcm_vod WHERE cover_host = ? LIMIT ?',
    [host, SAMPLE_COUNT],
  );
  const covers = rows.map((row) => row.cover).filter((cover) => cover !== '');
  // cover_host 是写入时从 cover 派生的冗余列，历史数据里两边会漂移：旧库导入的
  // cover_host 带端口（www.imgzy360.com:7788），而 hostOf() 会把端口去掉。
  // 所以比对前先统一口径；万一全都对不上（脏数据），仍以 cover_host 选出来的行为准，
  // 否则整个域名会被误报成「库里没有该域名的图片」。
  const target = normalizeHost(host);
  const matched = covers.filter((cover) => normalizeHost(hostOf(cover)) === target);
  const urls = matched.length > 0 ? matched : covers;
  if (urls.length === 0) {
    // 体检表会留着「已经没有影片归属」的历史域名（图床换掉、封面被清空后就是这样），
    // 这类不是图片坏了，而是库里已经没有影片再引用它，清掉记录即可。
    return {
      host,
      ok: false,
      status: 1,
      okCount: 0,
      failCount: 0,
      message: rows.length === 0 ? '该域名已无影片引用，可清理这条记录' : '库里没有该域名的图片',
    };
  }

  const results: ProbeResult[] = [];
  for (const url of urls) {
    const result = await probeImage(url);
    results.push(result);
    // 第一张就是网络不通（超时/DNS/连接失败）时，第二张必然同样不通，不必再等一个超时
    if (results.length === 1 && !result.ok && result.network) break;
  }
  const fails = results.filter((result) => !result.ok);
  const okCount = results.length - fails.length;
  if (fails.length === 0) {
    return { host, ok: true, status: 1, okCount, failCount: 0, message: `${okCount}/${results.length} 正常` };
  }
  // 全是网络不通：不下「失效」的结论，只标记无法验证
  const unverifiable = fails.every((result) => result.network);
  const first = fails[0]?.message ?? '未知原因';
  return {
    host,
    ok: false,
    status: unverifiable ? 3 : 2,
    okCount,
    failCount: fails.length,
    message: unverifiable
      ? `${okCount}/${results.length} 正常，服务器网络无法访问（${first}），未能验证`
      : `${okCount}/${results.length} 正常，失败：${first}`,
  };
}
