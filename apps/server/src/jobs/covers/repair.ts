import { hostOf } from '@lcm/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { CollectClient } from '../collect/client';
import { parseVodPage } from '../collect/parser';
import type { SourceRuntime } from '../collect/types';
import { checkHost, probeImage } from './probe';

/** 检查全部域名时同时进行的域名数；只影响不同域名之间，同一域名内仍抽 2 张、间隔 3 秒 */
export const HOST_PARALLEL = 8;

export type ScanResult = Awaited<ReturnType<typeof checkHost>> & { vodCount: number };

/** 检查一个域名并写入 lcm_cover_check */
export async function scanHost(prisma: PrismaService, host: string, vodCount: number): Promise<ScanResult> {
  const result = await checkHost(prisma, host);
  const data = {
    vodCount,
    status: result.status,
    sampleOk: result.okCount,
    sampleFail: result.failCount,
    message: result.message.slice(0, 255),
    checkedAt: new Date(),
  };
  await prisma.coverCheck.upsert({
    where: { host },
    create: { host, ...data },
    update: data,
  });
  return { ...result, vodCount };
}

/** 把这些影片的封面清空，前台退回占位图 */
export async function clearHostCovers(prisma: PrismaService, host: string): Promise<number> {
  const before = await prisma.vod.count({ where: { coverHost: host } });
  await prisma.vod.updateMany({ where: { coverHost: host }, data: { cover: '' } });
  await prisma.coverCheck.updateMany({
    where: { host },
    data: { status: 1, message: '已清空，前台使用占位图', checkedAt: new Date() },
  });
  return before;
}

export type RepairItem = { vodId: number; name: string; from: string; to: string; ok: boolean; reason: string };

/**
 * 修复某个域名下失效的封面。
 * 顺序：库内同名影片 → 本片其他线路的来源 → 按片名在所有启用源里搜；验证可用才写回。
 */
export async function repairHostCovers(
  prisma: PrismaService,
  input: { host: string; limit: number },
): Promise<{ fixed: number; failed: number; remaining: number; items: RepairItem[] }> {
  const { host, limit } = input;
  const targets = await prisma.vod.findMany({
    where: { coverHost: host },
    select: { id: true, name: true, cover: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

  const sources = await prisma.collectSource.findMany({ where: { isEnabled: 1 } });
  const clients = new Map<number, CollectClient>();
  const clientFor = (source: SourceRow): CollectClient => {
    let client = clients.get(source.id);
    if (!client) {
      client = new CollectClient(toRuntime(source));
      clients.set(source.id, client);
    }
    return client;
  };

  const items: RepairItem[] = [];
  let fixed = 0;
  let failed = 0;

  for (const target of targets) {
    const found = await resolveCover(prisma, target.id, target.name, sources, clientFor);
    if (found) {
      await prisma.vod.update({
        where: { id: target.id },
        data: { cover: found.url, coverHost: hostOf(found.url) },
      });
      fixed += 1;
      items.push({ vodId: target.id, name: target.name, from: target.cover, to: found.url, ok: true, reason: found.reason });
    } else {
      failed += 1;
      items.push({ vodId: target.id, name: target.name, from: target.cover, to: '', ok: false, reason: '没有找到可用来源' });
    }
  }

  const remaining = await prisma.vod.count({ where: { coverHost: host } });
  // 修完且没有剩余，把域名状态改成正常
  if (remaining === 0) {
    await prisma.coverCheck.updateMany({ where: { host }, data: { status: 1, message: '已全部替换' } });
  }
  return { fixed, failed, remaining, items };
}

type SourceRow = { id: number; name: string; apiUrl: string; apiParams: string; intervalSec: number; timeout: number };

function toRuntime(source: SourceRow): SourceRuntime {
  return {
    id: source.id,
    name: source.name,
    apiUrl: source.apiUrl,
    apiParams: source.apiParams,
    intervalSec: source.intervalSec,
    timeout: source.timeout,
    retryTimes: 0,
    pagesize: 20,
  };
}

/** 去掉源站加的失效标记（如 #err2025-11-18），并确认图片真的能访问 */
async function usableCover(url: string): Promise<string> {
  const clean = url.split('#')[0]?.trim() ?? '';
  if (!clean) return '';
  return (await probeImage(clean)).ok ? clean : '';
}

/** 为一部影片找替代封面 */
async function resolveCover(
  prisma: PrismaService,
  vodId: number,
  name: string,
  sources: SourceRow[],
  clientFor: (source: SourceRow) => CollectClient,
): Promise<{ url: string; reason: string } | null> {
  // 先看库里同名影片（往往是重复条目）有没有能用的封面，不用发网络请求
  const self = await prisma.vod.findUnique({ where: { id: vodId }, select: { nameHash: true } });
  if (self?.nameHash) {
    const siblings = await prisma.vod.findMany({
      where: { nameHash: self.nameHash, id: { not: vodId } },
      select: { cover: true },
      take: 5,
    });
    for (const sibling of siblings) {
      if (!sibling.cover) continue;
      if ((await probeImage(sibling.cover)).ok) return { url: sibling.cover, reason: '来自库内同名影片' };
    }
  }

  const plays = await prisma.vodPlay.findMany({
    where: { vodId, sourceId: { gt: 0 }, sourceVodId: { not: '' } },
    select: { sourceId: true, sourceVodId: true },
  });

  const seen = new Set<number>();
  for (const play of plays) {
    if (play.sourceId === null || seen.has(play.sourceId)) continue;
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

async function detailCover(client: CollectClient, sourceVodId: string): Promise<string> {
  try {
    const raw = await client.request({ ac: 'detail', ids: sourceVodId });
    const parsed = parseVodPage(raw);
    const item = parsed.list.find((row) => row.vodId === sourceVodId) ?? parsed.list[0];
    return item?.cover?.trim() ? item.cover.trim() : '';
  } catch {
    return '';
  }
}

async function searchCover(client: CollectClient, name: string): Promise<string> {
  try {
    const raw = await client.request({ ac: 'videolist', wd: name, pg: 1 });
    const parsed = parseVodPage(raw);
    const hit = parsed.list.find((row) => row.name.trim() === name.trim()) ?? parsed.list[0];
    return hit?.cover?.trim() ? hit.cover.trim() : '';
  } catch {
    return '';
  }
}
