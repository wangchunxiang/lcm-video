import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { collectSource, playLine, vodPlay } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

export interface LineRouteOpts {
  db: Db;
}

interface LineBody {
  name?: unknown;
  sort?: unknown;
  is_enabled?: unknown;
}

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export const lineRoutes: FastifyPluginAsync<LineRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (_req, reply) => {
    const rows = await db
      .select({
        id: playLine.id,
        sourceFrom: playLine.sourceFrom,
        name: playLine.name,
        sort: playLine.sort,
        isEnabled: playLine.isEnabled,
        updatedAt: playLine.updatedAt,
      })
      .from(playLine)
      .orderBy(asc(playLine.sort), asc(playLine.id));

    // 每个标识对应的采集源名称与线路条数，用于展示来源
    const stats = await db
      .select({
        sourceFrom: vodPlay.sourceFrom,
        sourceName: sql<string | null>`MAX(${collectSource.name})`,
        total: sql<number>`COUNT(*)`,
      })
      .from(vodPlay)
      .leftJoin(collectSource, eq(collectSource.id, vodPlay.sourceId))
      .groupBy(vodPlay.sourceFrom);

    const statMap = new Map(stats.map((row) => [row.sourceFrom, row]));
    const items = rows.map((row) => ({
      ...row,
      sourceName: statMap.get(row.sourceFrom)?.sourceName ?? '',
      vodCount: Number(statMap.get(row.sourceFrom)?.total ?? 0),
    }));

    return ok(reply, { items });
  });

  app.put('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    if (id <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路不存在');

    const body = (req.body ?? {}) as LineBody;
    const patch: { name?: string; sort?: number; isEnabled?: number } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string') return fail(reply, 400, ErrorCode.BAD_REQUEST, '显示名格式不正确');
      const name = body.name.trim();
      if (name.length > 50) return fail(reply, 400, ErrorCode.BAD_REQUEST, '显示名不能超过 50 个字符');
      patch.name = name;
    }

    if (body.sort !== undefined) {
      const sort = toInt(body.sort);
      if (sort < 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '排序不能为负数');
      patch.sort = sort;
    }

    if (body.is_enabled !== undefined) {
      patch.isEnabled = toInt(body.is_enabled) === 1 ? 1 : 0;
    }

    if (Object.keys(patch).length === 0) return ok(reply, null);

    const updated = await db.update(playLine).set(patch).where(eq(playLine.id, id));
    if (updated[0].affectedRows === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '线路不存在');

    return ok(reply, null);
  });

  app.post('/sort', async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map((item) => toInt(item)).filter((id) => id > 0) : [];
    if (ids.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少排序内容');

    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(playLine).set({ sort: (index + 1) * 10 }).where(eq(playLine.id, id));
      }
    });

    return ok(reply, null);
  });
};
