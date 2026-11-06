import type { FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { coverCheck, vod } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { HOST_PARALLEL, clearHostCovers, listCoverHosts, repairHostCovers, scanHost } from '../../lib/covers/check.ts';

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
      unverified: items.filter((item) => item.status === 3).length,
      unchecked: items.filter((item) => item.status === 0).length,
    };
    return ok(reply, { items, summary });
  });

  /**
   * 检查一个域名或全部域名。
   * mode=pending（默认）只检查未检查/失效/无法验证的域名，跳过上次正常的；
   * mode=all 忽略历史结果，全部重检。
   */
  app.post('/scan', async (request, reply) => {
    const body = (request.body ?? {}) as { host?: unknown; mode?: unknown };
    const host = String(body.host ?? '').trim();
    if (host) {
      const result = await scanHost(db, host, await countHost(db, host));
      return ok(reply, { items: [result], skipped: 0 });
    }

    const mode = String(body.mode ?? 'pending') === 'all' ? 'all' : 'pending';
    const hosts = await listCoverHosts(db);
    let targets = hosts;
    let skipped = 0;
    if (mode === 'pending') {
      const states = await db.select({ host: coverCheck.host, status: coverCheck.status }).from(coverCheck);
      const passed = new Set(states.filter((state) => state.status === 1).map((state) => state.host));
      targets = hosts.filter((item) => !passed.has(item.host));
      skipped = hosts.length - targets.length;
    }

    const results: Array<Awaited<ReturnType<typeof scanHost>>> = [];
    // 用固定大小的并发池逐个取任务：快的域名不会等慢的，避免按批切分时每批都被最慢的那个拖住
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const item = targets[cursor++];
        if (!item) break;
        results.push(await scanHost(db, item.host, item.vodCount));
      }
    };
    await Promise.all(Array.from({ length: Math.min(HOST_PARALLEL, targets.length) }, worker));
    return ok(reply, { items: results, skipped });
  });

  /** 某域名下的影片列表 */
  app.get('/:host/vods', async (request, reply) => {
    const host = String((request.params as { host: string }).host ?? '').trim();
    if (!host) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少域名');
    const query = request.query as { page?: string; page_size?: string };
    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toInt(query.page_size, 20)));

    const [rows, countRow] = await Promise.all([
      db
        .select({ id: vod.id, name: vod.name, cover: vod.cover, status: vod.status })
        .from(vod)
        .where(eq(sql`cover_host`, host))
        .orderBy(vod.id)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ c: sql<number>`COUNT(*)` }).from(vod).where(eq(sql`cover_host`, host)),
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
        .where(eq(sql`cover_host`, host));
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
        .where(eq(sql`cover_host`, host));
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
    .where(eq(sql`cover_host`, host));
  return Number(row?.c ?? 0);
}
