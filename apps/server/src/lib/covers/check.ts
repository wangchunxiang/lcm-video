import { and, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { collectSource, coverCheck, vod, vodPlay } from '@lcm/db';
import { CollectClient } from '../collect/client.ts';
import { parseVodPage } from '../collect/parser.ts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/** 体检图片时使用的 Referer：与浏览器从本站加载图片的行为一致 */
const PAGE_REFERER = 'https://www.lcm-video.com/';

/** 每个域名抽 2 张 */
const SAMPLE_COUNT = 2;
/** 同一域名两次图片请求之间的间隔 */
const SAMPLE_INTERVAL_MS = 3000;
/** 检查全部时同时进行的域名数 */
export const HOST_PARALLEL = 5;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type CheckResult = {
  host: string;
  ok: boolean;
  okCount: number;
  failCount: number;
  message: string;
};

/** 取 URL 的域名，取不到返回空串 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/** 每个域名上次图片请求结束的时间戳 */
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

/** 探测一张图片是否可访问：先 HEAD，失败再退回 GET 取首字节 */
export async function probeImage(url: string, timeoutMs = 5000): Promise<{ ok: boolean; message: string }> {
  if (!url) return { ok: false, message: '地址为空' };
  const head = await request(url, 'HEAD', timeoutMs);
  if (head.ok) return head;
  // 有的图床不支持 HEAD（405），退回带 Range 的 GET，只读前 1KB
  const get = await request(url, 'GET', timeoutMs, { Range: 'bytes=0-1023' });
  return get.ok ? get : head;
}

/** 每个 HTTP 请求都按时限流：同一域名两次请求间隔 3 秒 */
async function request(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  extra: Record<string, string> = {},
): Promise<{ ok: boolean; message: string }> {
  const host = hostOf(url);
  if (!host) return requestOnce(url, method, timeoutMs, extra);
  return withHostThrottle(host, () => requestOnce(url, method, timeoutMs, extra));
}

async function requestOnce(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  extra: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(url, {
      method,
      // 带上 Referer：模拟浏览器从本站页面加载图片，否则图床的防盗链会误判为失效
      headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8', referer: PAGE_REFERER, ...extra },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
    if (!type.startsWith('image/')) return { ok: false, message: `返回 ${type || '未知类型'}，不是图片` };
    if (method === 'GET') await response.body?.cancel();
    return { ok: true, message: '正常' };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, message: '连接超时' };
    const reason = error instanceof Error ? error.message : String(error);
    if (/ENOTFOUND|getaddrinfo/.test(reason)) return { ok: false, message: 'DNS 解析失败' };
    return { ok: false, message: `连接失败：${reason.slice(0, 80)}` };
  }
}

/** 库里的图片域名分布 */
export async function listCoverHosts(db: Db): Promise<Array<{ host: string; vodCount: number }>> {
  const hostExpr = sql<string>`cover_host`;
  const rows = await db
    .select({ host: hostExpr, vodCount: sql<number>`COUNT(*)` })
    .from(vod)
    .where(sql`cover_host <> ''`)
    .groupBy(hostExpr)
    .orderBy(sql`COUNT(*) DESC`);
  return rows
    .map((row) => ({ host: String(row.host), vodCount: Number(row.vodCount) }))
    // cover 若被写成 /uploads/xxx.jpg 这类本地路径，生成列会取出文件名，这里按域名形状过滤掉
    .filter((row) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(row.host) && !/\.(jpe?g|png|gif|webp|avif|svg)$/i.test(row.host));
}

/** 从库里取某域名下的若干条封面地址 */
async function sampleUrls(db: Db, host: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ cover: vod.cover })
    .from(vod)
    .where(eq(sql`cover_host`, host))
    .limit(limit);
  const urls = rows.map((row) => row.cover).filter((cover) => hostOf(cover) === host);
  return urls;
}

/** 检查单个域名：抽 2 张，同一域名内两次请求间隔 3 秒 */
export async function checkHost(db: Db, host: string): Promise<CheckResult> {
  const urls = await sampleUrls(db, host, SAMPLE_COUNT);
  if (urls.length === 0) {
    return { host, ok: false, okCount: 0, failCount: 0, message: '库里没有该域名的图片' };
  }

  const results: Array<{ ok: boolean; message: string }> = [];
  for (const url of urls) results.push(await probeImage(url));
  const failFirst = results.filter((result) => !result.ok);
  const okCount = results.length - failFirst.length;
  if (failFirst.length === 0) {
    return { host, ok: true, okCount, failCount: 0, message: `${okCount}/${results.length} 正常` };
  }
  return {
    host,
    ok: false,
    okCount,
    failCount: failFirst.length,
    message: `${okCount}/${results.length} 正常，失败：${failFirst[0]?.message ?? '未知原因'}`,
  };
}

/** 检查并写入 lcm_cover_check */
export async function scanHost(db: Db, host: string, vodCount: number): Promise<CheckResult & { vodCount: number }> {
  const result = await checkHost(db, host);
  const values = {
    host,
    vodCount,
    status: result.ok ? 1 : 2,
    sampleOk: result.okCount,
    sampleFail: result.failCount,
    message: result.message.slice(0, 255),
    checkedAt: sql`NOW()`,
  };
  await db
    .insert(coverCheck)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
  return { ...result, vodCount };
}

export type RepairItem = { vodId: number; name: string; from: string; to: string; ok: boolean; reason: string };

/**
 * 修复某个域名下失效的封面。
 * 顺序：本片其他线路的来源 → 按片名在所有启用源里搜 → 验证可用才写回。
 */
export async function repairHostCovers(
  db: Db,
  input: { host: string; limit: number },
): Promise<{ fixed: number; failed: number; remaining: number; items: RepairItem[] }> {
  const { host, limit } = input;
  const targets = await db
    .select({ id: vod.id, name: vod.name, cover: vod.cover })
    .from(vod)
    .where(eq(sql`cover_host`, host))
    .limit(limit);

  const sources = await db
    .select()
    .from(collectSource)
    .where(eq(collectSource.isEnabled, 1));

  const clients = new Map<number, CollectClient>();
  const clientFor = (source: SourceRow): CollectClient => {
    let client = clients.get(source.id);
    if (!client) {
      client = clientOf(source);
      clients.set(source.id, client);
    }
    return client;
  };

  const items: RepairItem[] = [];
  let fixed = 0;
  let failed = 0;

  for (const target of targets) {
    const found = await resolveCover(db, target.id, target.name, sources, clientFor);
    if (found) {
      await db.update(vod).set({ cover: found.url }).where(eq(vod.id, target.id));
      fixed += 1;
      items.push({ vodId: target.id, name: target.name, from: target.cover, to: found.url, ok: true, reason: found.reason });
    } else {
      failed += 1;
      items.push({
        vodId: target.id,
        name: target.name,
        from: target.cover,
        to: '',
        ok: false,
        reason: found ? '找到的图片也不可用' : '没有找到可用来源',
      });
    }
  }

  const [remainRow] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(vod)
    .where(eq(sql`cover_host`, host));
  const remaining = Number(remainRow?.c ?? 0);

  // 修完且没有剩余，把域名状态改成正常
  if (remaining === 0) {
    await db.update(coverCheck).set({ status: 1, message: '已全部替换' }).where(eq(coverCheck.host, host));
  }
  return { fixed, failed, remaining, items };
}

/** 把这些影片的封面清空，前台会退回占位图 */
export async function clearHostCovers(db: Db, host: string): Promise<number> {
  await db.update(vod).set({ cover: '' }).where(eq(sql`cover_host`, host));
  await db.update(coverCheck).set({ status: 1, message: '已清空，前台使用占位图' }).where(eq(coverCheck.host, host));
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(vod)
    .where(eq(sql`cover_host`, host));
  return Number(row?.c ?? 0);
}

type SourceRow = typeof collectSource.$inferSelect;

/** 去掉源站加的失效标记（如 #err2025-11-18），并确认图片真的能访问 */
async function usableCover(url: string): Promise<string> {
  const clean = url.split('#')[0]?.trim() ?? '';
  if (!clean) return '';
  return (await probeImage(clean)).ok ? clean : '';
}

/** 为一部影片找替代封面：库内同名 → 本片其他线路 → 按片名搜其他源 */
async function resolveCover(
  db: Db,
  vodId: number,
  name: string,
  sources: SourceRow[],
  clientFor: (source: SourceRow) => CollectClient,
): Promise<{ url: string; reason: string } | null> {
  // 先看库里同名影片（往往是重复条目）有没有能用的封面，不用发网络请求
  const [self] = await db.select({ nameHash: vod.nameHash }).from(vod).where(eq(vod.id, vodId));
  if (self?.nameHash) {
    const siblings = await db
      .select({ cover: vod.cover })
      .from(vod)
      .where(and(eq(vod.nameHash, self.nameHash), ne(vod.id, vodId)))
      .limit(5);
    for (const sibling of siblings) {
      if (!sibling.cover) continue;
      if ((await probeImage(sibling.cover)).ok) return { url: sibling.cover, reason: '来自库内同名影片' };
    }
  }

  const plays = await db
    .select({ sourceId: vodPlay.sourceId, sourceVodId: vodPlay.sourceVodId })
    .from(vodPlay)
    .where(and(eq(vodPlay.vodId, vodId), sql`${vodPlay.sourceId} > 0`, sql`${vodPlay.sourceVodId} <> ''`));

  const seen = new Set<number>();
  for (const play of plays) {
    if (seen.has(play.sourceId)) continue;
    seen.add(play.sourceId);
    const source = sources.find((row) => row.id === play.sourceId);
    if (!source) continue;
    const url = await usableCover(await detailCover(clientFor(source), play.sourceVodId));
    if (url) return { url, reason: `来自线路源「${source.name}」` };
  }

  for (const source of sources) {
    const url = await usableCover(await searchCover(clientFor(source), name));
    if (url) return { url, reason: `搜索源「${source.name}」` };
  }
  return null;
}

function clientOf(source: SourceRow): CollectClient {
  return new CollectClient({
    id: source.id,
    name: source.name,
    apiUrl: source.apiUrl,
    apiFormat: source.apiFormat,
    apiParams: source.apiParams,
    intervalSec: source.intervalSec,
    timeout: source.timeout,
    retryTimes: 0,
  });
}

async function detailCover(client: CollectClient, sourceVodId: string): Promise<string> {
  try {
    const raw = await client.request({ ac: 'detail', ids: sourceVodId, at: client.apiFormat });
    const parsed = parseVodPage(raw, client.apiFormat);
    const item = parsed.list.find((row) => row.vodId === sourceVodId) ?? parsed.list[0];
    return item?.cover?.trim() ? item.cover.trim() : '';
  } catch {
    return '';
  }
}

async function searchCover(client: CollectClient, name: string): Promise<string> {
  try {
    const raw = await client.request({ ac: 'videolist', wd: name, at: client.apiFormat, pg: 1 });
    const parsed = parseVodPage(raw, client.apiFormat);
    const hit = parsed.list.find((row) => row.name.trim() === name.trim()) ?? parsed.list[0];
    return hit?.cover?.trim() ? hit.cover.trim() : '';
  } catch {
    return '';
  }
}
