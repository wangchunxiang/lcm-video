import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { collectSource, playLine } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { toInt } from '@lcm/shared';

export interface LineRouteOpts {
  db: Db;
}

interface LineBody {
  name?: unknown;
  sort?: unknown;
  is_enabled?: unknown;
}

export const lineRoutes: FastifyPluginAsync<LineRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (req, reply) => {
    const query = req.query as { keyword?: string; status?: string; page?: string; page_size?: string };
    const keyword = (query.keyword ?? '').trim();
    const status = query.status ?? '';
    const page = Math.max(1, toInt(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, toInt(query.page_size) || 20));

    const conditions = [];
    if (keyword) {
      conditions.push(or(like(playLine.sourceFrom, `%${keyword}%`), like(playLine.name, `%${keyword}%`)));
    }
    if (status === '0' || status === '1') conditions.push(eq(playLine.isEnabled, Number(status)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db.select({ value: sql<number>`COUNT(*)` }).from(playLine).where(where);
    const total = Number(totalRows[0]?.value ?? 0);

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
      .where(where)
      .orderBy(asc(playLine.sort), asc(playLine.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // 来源：按采集源登记的线路标识反查，不扫 lcm_vod_play
    const sources = await db
      .select({ name: collectSource.name, playFrom: collectSource.playFrom })
      .from(collectSource);
    const sourceMap = new Map<string, string>();
    for (const source of sources) {
      for (const from of source.playFrom.split(',')) {
        const value = from.trim();
        if (value && !sourceMap.has(value)) sourceMap.set(value, source.name);
      }
    }

    const items = rows.map((row) => ({
      ...row,
      sourceName: sourceMap.get(row.sourceFrom) ?? '',
    }));

    return ok(reply, { items, total, page, page_size: pageSize });
  });

  app.post('/batch', async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: unknown; action?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map((item) => toInt(item)).filter((id) => id > 0) : [];
    if (ids.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请先选择线路');

    const action = String(body.action ?? '');
    if (action !== 'enable' && action !== 'disable') {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '不支持的操作');
    }

    await db
      .update(playLine)
      .set({ isEnabled: action === 'enable' ? 1 : 0 })
      .where(inArray(playLine.id, ids));

    return ok(reply, null);
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

  app.delete('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    if (id <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路不存在');

    const deleted = await db.delete(playLine).where(eq(playLine.id, id));
    if (deleted[0].affectedRows === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '线路不存在');

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
