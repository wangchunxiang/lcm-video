import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { category, collectSource, collectSourceCategory, vod } from '@lcm/db';
import { autoMatchCategory, loadCategories } from '../../lib/collect/match.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { toInt } from '@lcm/shared';

export interface SourceCategoryRouteOpts {
  db: Db;
}

interface MappingBody {
  category_id?: unknown;
  status?: unknown;
}

export const sourceCategoryRoutes: FastifyPluginAsync<SourceCategoryRouteOpts> = async (app, opts) => {
  const { db } = opts;

  const requireSource = async (id: number) => {
    const rows = await db.select({ id: collectSource.id }).from(collectSource).where(eq(collectSource.id, id)).limit(1);
    return rows[0] !== undefined;
  };

  const applyMapping = async (id: number, body: MappingBody): Promise<string | null> => {
    const categoryId = toInt(body.category_id, 0);
    const status = toInt(body.status, -1);

    if (status === 2) {
      await db
        .update(collectSourceCategory)
        .set({ categoryId: 0, status: 2, matchType: 2 })
        .where(eq(collectSourceCategory.id, id));
      return null;
    }

    if (status === 0 && categoryId === 0) {
      await db
        .update(collectSourceCategory)
        .set({ categoryId: 0, status: 0, matchType: 0 })
        .where(eq(collectSourceCategory.id, id));
      return null;
    }

    if (categoryId <= 0) return '请选择本站分类';

    const exists = await db.select({ id: category.id }).from(category).where(eq(category.id, categoryId)).limit(1);
    if (!exists[0]) return '本站分类不存在';

    await db
      .update(collectSourceCategory)
      .set({ categoryId, status: 1, matchType: 2 })
      .where(eq(collectSourceCategory.id, id));
    return null;
  };

  app.get('/:id/categories', async (req, reply) => {
    const sourceId = toInt((req.params as { id: string }).id);
    if (!(await requireSource(sourceId))) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const rows = await db
      .select({
        id: collectSourceCategory.id,
        sourceTypeId: collectSourceCategory.sourceTypeId,
        sourceTypeName: collectSourceCategory.sourceTypeName,
        sourceTypePid: collectSourceCategory.sourceTypePid,
        categoryId: collectSourceCategory.categoryId,
        matchType: collectSourceCategory.matchType,
        status: collectSourceCategory.status,
        categoryName: category.name,
        categoryPid: category.pid,
        updatedAt: collectSourceCategory.updatedAt,
      })
      .from(collectSourceCategory)
      .leftJoin(category, eq(category.id, collectSourceCategory.categoryId))
      .where(eq(collectSourceCategory.sourceId, sourceId))
      .orderBy(collectSourceCategory.sourceTypePid, collectSourceCategory.id);

    const summary = {
      total: rows.length,
      mapped: rows.filter((row) => row.status === 1).length,
      ignored: rows.filter((row) => row.status === 2).length,
      unmapped: rows.filter((row) => row.status === 0).length,
    };

    return ok(reply, { items: rows, summary });
  });

  app.put('/:id/categories/batch', async (req, reply) => {
    const sourceId = toInt((req.params as { id: string }).id);
    if (!(await requireSource(sourceId))) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const body = (req.body ?? {}) as { ids?: unknown } & MappingBody;
    const ids = Array.isArray(body.ids) ? body.ids.map((item) => toInt(item)).filter((id) => id > 0) : [];
    if (ids.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择要映射的源站分类');

    const rows = await db
      .select({ id: collectSourceCategory.id })
      .from(collectSourceCategory)
      .where(and(eq(collectSourceCategory.sourceId, sourceId), inArray(collectSourceCategory.id, ids)));
    if (rows.length === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '所选分类不属于该采集源');

    const categoryId = toInt(body.category_id, 0);
    const status = toInt(body.status, -1);

    const targetIds = rows.map((row) => row.id);

    if (status === 2) {
      await db
        .update(collectSourceCategory)
        .set({ categoryId: 0, status: 2, matchType: 2 })
        .where(inArray(collectSourceCategory.id, targetIds));
      return ok(reply, { affected: targetIds.length });
    }

    if (status === 0 && categoryId === 0) {
      await db
        .update(collectSourceCategory)
        .set({ categoryId: 0, status: 0, matchType: 0 })
        .where(inArray(collectSourceCategory.id, targetIds));
      return ok(reply, { affected: targetIds.length });
    }

    if (categoryId <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择本站分类');

    const exists = await db.select({ id: category.id }).from(category).where(eq(category.id, categoryId)).limit(1);
    if (!exists[0]) return fail(reply, 400, ErrorCode.BAD_REQUEST, '本站分类不存在');

    await db
      .update(collectSourceCategory)
      .set({ categoryId, status: 1, matchType: 2 })
      .where(inArray(collectSourceCategory.id, targetIds));

    return ok(reply, { affected: rows.length });
  });

  app.put('/:id/categories/:sid', async (req, reply) => {
    const params = req.params as { id: string; sid: string };
    const sourceId = toInt(params.id);
    const id = toInt(params.sid);
    if (!(await requireSource(sourceId))) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const rows = await db
      .select({ id: collectSourceCategory.id })
      .from(collectSourceCategory)
      .where(and(eq(collectSourceCategory.id, id), eq(collectSourceCategory.sourceId, sourceId)))
      .limit(1);
    if (!rows[0]) return fail(reply, 404, ErrorCode.NOT_FOUND, '映射记录不存在');

    const error = await applyMapping(id, (req.body ?? {}) as MappingBody);
    if (error) return fail(reply, 400, ErrorCode.BAD_REQUEST, error);
    return ok(reply, { id });
  });

  app.post('/:id/categories/match', async (req, reply) => {
    const sourceId = toInt((req.params as { id: string }).id);
    if (!(await requireSource(sourceId))) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const pending = await db
      .select({
        id: collectSourceCategory.id,
        sourceTypeName: collectSourceCategory.sourceTypeName,
      })
      .from(collectSourceCategory)
      .where(
        and(
          eq(collectSourceCategory.sourceId, sourceId),
          eq(collectSourceCategory.status, 0),
          eq(collectSourceCategory.categoryId, 0),
        ),
      );

    const categories = await loadCategories(db);
    let matched = 0;
    for (const row of pending) {
      const categoryId = autoMatchCategory(row.sourceTypeName, categories);
      if (categoryId === 0) continue;
      await db
        .update(collectSourceCategory)
        .set({ categoryId, matchType: 1, status: 1 })
        .where(eq(collectSourceCategory.id, row.id));
      matched += 1;
    }

    return ok(reply, { scanned: pending.length, matched });
  });

  app.post('/:id/categories/:sid/remap-vods', async (req, reply) => {
    const params = req.params as { id: string; sid: string };
    const sourceId = toInt(params.id);
    const id = toInt(params.sid);
    if (!(await requireSource(sourceId))) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const rows = await db
      .select({
        id: collectSourceCategory.id,
        categoryId: collectSourceCategory.categoryId,
      })
      .from(collectSourceCategory)
      .where(and(eq(collectSourceCategory.id, id), eq(collectSourceCategory.sourceId, sourceId)))
      .limit(1);
    const mapping = rows[0];
    if (!mapping) return fail(reply, 404, ErrorCode.NOT_FOUND, '映射记录不存在');

    const body = (req.body ?? {}) as { from_category_id?: unknown };
    const fromId = toInt(body.from_category_id, 0);
    if (fromId <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请提供原分类，用于定位要重刷的影片');
    if (mapping.categoryId === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '该映射尚未设置目标分类');

    const target = await db
      .select({ id: category.id, pid: category.pid })
      .from(category)
      .where(eq(category.id, mapping.categoryId))
      .limit(1);
    const targetCategory = target[0];
    if (!targetCategory) return fail(reply, 400, ErrorCode.BAD_REQUEST, '目标分类不存在');

    if (fromId === targetCategory.id) {
      return ok(reply, { affected: 0, from: fromId, to: targetCategory.id });
    }

    const counted = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(vod)
      .where(eq(vod.categoryId, fromId));
    const affected = Number(counted[0]?.count ?? 0);

    if (affected > 0) {
      await db
        .update(vod)
        .set({ categoryId: targetCategory.id, categoryPid: targetCategory.pid })
        .where(eq(vod.categoryId, fromId));
    }

    return ok(reply, { affected, from: fromId, to: targetCategory.id });
  });
};
