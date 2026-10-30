import type { FastifyPluginAsync } from 'fastify';
import { eq, like, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { coverCheck, vod } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { clearHostCovers, listCoverHosts, repairHostCovers, scanHost } from '../../lib/covers/check.ts';

type Options = { db: Db };

function toInt(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/** 图片检查：按域名体检封面 */
export const coverCheckRoutes: FastifyPluginAsync<Options> = async (app, { db }) => {
  app.get('/', async (_request, reply) => {
    const hosts = await listCoverHosts(db);
    const rows = await db.select().from(coverCheck);
    const byHost = new Map(rows.map((row) => [row.host, row]));

    const items = hosts.map((item) => {
      const state = byHost.get(item.host);
      return {
        host: item.host,
        vodCount: item.vodCount,
        status: state?.status ?? 0,
        sampleOk: state?.sampleOk ?? 0,
        sampleFail: state?.sampleFail ?? 0,
        message: state?.message ?? '',
        checkedAt: state?.checkedAt ?? null,
      };
    });
    const summary = {
      hosts: items.length,
      ok: items.filter((item) => item.status === 1).length,
      bad: items.filter((item) => item.status === 2).length,
      unchecked: items.filter((item) => item.status === 0).length,
    };
    return ok(reply, { items, summary });
  });

  /** 检查一个域名或全部域名 */
  app.post('/scan', async (request, reply) => {
    const body = (request.body ?? {}) as { host?: unknown };
    const host = String(body.host ?? '').trim();
    if (host) {
      const result = await scanHost(db, host, await countHost(db, host));
      return ok(reply, { items: [result] });
    }

    const hosts = await listCoverHosts(db);
    const results = [];
    // 同一批最多 4 个域名并行，域名内部已经是并发抽 3 张
    for (let i = 0; i < hosts.length; i += 4) {
      const slice = hosts.slice(i, i + 4);
      const part = await Promise.all(slice.map((item) => scanHost(db, item.host, item.vodCount)));
      results.push(...part);
    }
    return ok(reply, { items: results });
  });

  /** 某域名下的影片列表 */
  app.get('/:host/vods', async (request, reply) => {
    const host = String((request.params as { host: string }).host ?? '').trim();
    if (!host) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少域名');
    const query = request.query as { page?: string; page_size?: string };
    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toInt(query.page_size, 20)));
    const pattern = `%://${host}/%`;

    const [rows, countRow] = await Promise.all([
      db
        .select({ id: vod.id, name: vod.name, cover: vod.cover, status: vod.status })
        .from(vod)
        .where(like(vod.cover, pattern))
        .orderBy(vod.id)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ c: sql<number>`COUNT(*)` }).from(vod).where(like(vod.cover, pattern)),
    ]);
    return ok(reply, {
      items: rows,
      total: Number(countRow[0]?.c ?? 0),
      page,
      page_size: pageSize,
    });
  });

  /** 清空该域名下的封面，前台退回占位图 */
  app.post('/clear', async (request, reply) => {
    const body = (request.body ?? {}) as { host?: unknown; confirm?: unknown };
    const host = String(body.host ?? '').trim();
    if (!host) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少域名');
    if (body.confirm !== true) {
      const [row] = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(vod)
        .where(like(vod.cover, `%://${host}/%`));
      return ok(reply, { needConfirm: true, total: Number(row?.c ?? 0) });
    }
    const before = await countHost(db, host);
    await clearHostCovers(db, host);
    return ok(reply, { needConfirm: false, cleared: before });
  });

  /** 修复该域名下的封面；confirm=false 只返回剩余条数 */
  app.post('/repair', async (request, reply) => {
    const body = (request.body ?? {}) as { host?: unknown; confirm?: unknown; limit?: unknown };
    const host = String(body.host ?? '').trim();
    if (!host) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少域名');
    const limit = Math.min(50, Math.max(1, toInt(body.limit, 20)));

    if (body.confirm !== true) {
      const [row] = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(vod)
        .where(like(vod.cover, `%://${host}/%`));
      return ok(reply, { needConfirm: true, total: Number(row?.c ?? 0), fixed: 0, failed: 0, remaining: Number(row?.c ?? 0), items: [] });
    }

    const result = await repairHostCovers(db, { host, limit });
    return ok(reply, { needConfirm: false, total: result.fixed + result.failed, ...result });
  });
};

async function countHost(db: Db, host: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(vod)
    .where(eq(sql`SUBSTRING_INDEX(SUBSTRING_INDEX(cover, '/', 3), '/', -1)`, host));
  return Number(row?.c ?? 0);
}
