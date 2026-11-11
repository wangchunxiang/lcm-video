import { hostOf } from '@lcm/shared';
import type { DataSource } from 'typeorm';
import { CollectClient } from '../collect/client';
import { parseVodPage } from '../collect/parser';
import type { SourceRuntime } from '../collect/types';
import { checkHost, probeImage } from './probe';

/** 检查全部域名时同时进行的域名数；只影响不同域名之间，同一域名内仍抽 2 张、间隔 3 秒 */
export const HOST_PARALLEL = 8;

export type ScanResult = Awaited<ReturnType<typeof checkHost>> & { vodCount: number };

/** 检查一个域名并写入 lcm_cover_check */
export async function scanHost(dataSource: DataSource, host: string, vodCount: number): Promise<ScanResult> {
  const result = await checkHost(dataSource, host);
  const message = result.message.slice(0, 255);
  // upsert：host 上有唯一索引 uk_host。
  // 不用 ON DUPLICATE KEY UPDATE col = VALUES(col)（MySQL 8.0.20 起已废弃），
  // 改成再传一遍同名参数，5.7 / 8.x 都能跑。
  await dataSource.query(
    `INSERT INTO lcm_cover_check
       (host, vod_count, status, sample_ok, sample_fail, message, checked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       vod_count = ?, status = ?, sample_ok = ?, sample_fail = ?, message = ?,
       checked_at = NOW(), updated_at = NOW()`,
    [
      host,
      vodCount,
      result.status,
      result.okCount,
      result.failCount,
      message,
      vodCount,
      result.status,
      result.okCount,
      result.failCount,
      message,
    ],
  );
  return { ...result, vodCount };
}

/** 把这些影片的封面清空，前台退回占位图 */
export async function clearHostCovers(dataSource: DataSource, host: string): Promise<number> {
  const [count] = await dataSource.query<Array<{ total: number }>>(
    'SELECT COUNT(*) AS total FROM lcm_vod WHERE cover_host = ?',
    [host],
  );
  const before = Number(count?.total ?? 0);
  // cover 清空时 cover_host 必须一起清空：它是 cover 的冗余列，留着会继续被体检扫到
  await dataSource.query(
    "UPDATE lcm_vod SET cover = '', cover_host = '', updated_at = NOW() WHERE cover_host = ?",
    [host],
  );
  await dataSource.query(
    `UPDATE lcm_cover_check
        SET status = 1, message = ?, checked_at = NOW(), updated_at = NOW()
      WHERE host = ?`,
    ['已清空，前台使用占位图', host],
  );
  return before;
}

export type RepairItem = { vodId: string; name: string; from: string; to: string; ok: boolean; reason: string };

/**
 * 修复某个域名下失效的封面。
 * 顺序：库内同名影片 → 本片其他线路的来源 → 按片名在所有启用源里搜；验证可用才写回。
 */
export async function repairHostCovers(
  dataSource: DataSource,
  input: { host: string; limit: number },
): Promise<{ fixed: number; failed: number; remaining: number; items: RepairItem[] }> {
  const { host, limit } = input;
  const targets = await dataSource.query<Array<{ id: string; name: string; cover: string }>>(
    'SELECT id, name, cover FROM lcm_vod WHERE cover_host = ? ORDER BY id ASC LIMIT ?',
    [host, limit],
  );

  const sources = await dataSource.query<Array<SourceRow>>(
    `SELECT id, name, api_url AS apiUrl, api_params AS apiParams,
            interval_sec AS intervalSec, timeout
       FROM lcm_collect_source
      WHERE is_enabled = 1`,
  );
  const clients = new Map<string, CollectClient>();
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
    const found = await resolveCover(dataSource, target.id, target.name, sources, clientFor);
    if (found) {
      await dataSource.query(
        'UPDATE lcm_vod SET cover = ?, cover_host = ?, updated_at = NOW() WHERE id = ?',
        [found.url, hostOf(found.url), target.id],
      );
      fixed += 1;
      items.push({ vodId: target.id, name: target.name, from: target.cover, to: found.url, ok: true, reason: found.reason });
    } else {
      failed += 1;
      items.push({ vodId: target.id, name: target.name, from: target.cover, to: '', ok: false, reason: '没有找到可用来源' });
    }
  }

  const [rest] = await dataSource.query<Array<{ total: number }>>(
    'SELECT COUNT(*) AS total FROM lcm_vod WHERE cover_host = ?',
    [host],
  );
  const remaining = Number(rest?.total ?? 0);
  // 修完且没有剩余，把域名状态改成正常
  if (remaining === 0) {
    await dataSource.query('UPDATE lcm_cover_check SET status = 1, message = ?, updated_at = NOW() WHERE host = ?', [
      '已全部替换',
      host,
    ]);
  }
  return { fixed, failed, remaining, items };
}

type SourceRow = { id: string; name: string; apiUrl: string; apiParams: string; intervalSec: number; timeout: number };

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
  dataSource: DataSource,
  vodId: string,
  name: string,
  sources: SourceRow[],
  clientFor: (source: SourceRow) => CollectClient,
): Promise<{ url: string; reason: string } | null> {
  // 先看库里同名影片（往往是重复条目）有没有能用的封面，不用发网络请求
  const [self] = await dataSource.query<Array<{ nameHash: string }>>(
    'SELECT name_hash AS nameHash FROM lcm_vod WHERE id = ? LIMIT 1',
    [vodId],
  );
  if (self && self.nameHash) {
    const siblings = await dataSource.query<Array<{ cover: string }>>(
      'SELECT cover FROM lcm_vod WHERE name_hash = ? AND id <> ? LIMIT 5',
      [self.nameHash, vodId],
    );
    for (const sibling of siblings) {
      if (!sibling.cover) continue;
      if ((await probeImage(sibling.cover)).ok) return { url: sibling.cover, reason: '来自库内同名影片' };
    }
  }

  const plays = await dataSource.query<Array<{ sourceId: string | null; sourceVodId: string }>>(
    `SELECT source_id AS sourceId, source_vod_id AS sourceVodId
       FROM lcm_vod_play
      WHERE vod_id = ? AND source_id > 0 AND source_vod_id <> ''`,
    [vodId],
  );

  const seen = new Set<string>();
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
