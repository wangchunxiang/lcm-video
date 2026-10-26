import { and, eq, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { category, collectSourceCategory, vod } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

export interface CategoryRouteOpts {
  db: Db;
}

const ALIAS_RE = /^[a-z0-9-]+$/;

interface CategoryBody {
  pid?: unknown;
  name?: unknown;
  alias?: unknown;
  match_names?: unknown;
  sort?: unknown;
  is_show?: unknown;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function validateBody(
  db: Db,
  body: CategoryBody,
  selfId: number | null,
): Promise<{ data: typeof category.$inferInsert } | { error: string }> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: '分类名称不能为空' };
  if (name.length > 50) return { error: '分类名称不能超过 50 个字符' };

  const alias = typeof body.alias === 'string' ? body.alias.trim() : '';
  if (!alias) return { error: 'URL 别名不能为空' };
  if (alias.length > 50) return { error: 'URL 别名不能超过 50 个字符' };
  if (!ALIAS_RE.test(alias)) return { error: 'URL 别名只能包含小写字母、数字和减号' };

  const duplicate = await db
    .select({ id: category.id })
    .from(category)
    .where(selfId === null ? eq(category.alias, alias) : and(eq(category.alias, alias), ne(category.id, selfId)))
    .limit(1);
  if (duplicate.length > 0) return { error: 'URL 别名已被占用' };

  const pid = toInt(body.pid, 0);
  if (pid < 0) return { error: '父分类不合法' };
  if (pid > 0) {
    if (selfId !== null && pid === selfId) return { error: '不能把自己设为父分类' };
    const parentRows = await db
      .select({ id: category.id, pid: category.pid })
      .from(category)
      .where(eq(category.id, pid))
      .limit(1);
    const parent = parentRows[0];
    if (!parent) return { error: '父分类不存在' };
    if (parent.pid !== 0) return { error: '分类最多两级，父分类必须是一级分类' };

    if (selfId !== null) {
      const children = await db
        .select({ id: category.id })
        .from(category)
        .where(eq(category.pid, selfId))
        .limit(1);
      if (children.length > 0) return { error: '该分类下还有子分类，不能变成二级分类' };
    }
  }

  const matchNames = typeof body.match_names === 'string' ? body.match_names.trim() : '';

  return {
    data: {
      pid,
      name,
      alias,
      matchNames: matchNames.slice(0, 255),
      sort: toInt(body.sort, 0),
      isShow: body.is_show === 0 || body.is_show === false ? 0 : 1,
    },
  };
}

export const categoryRoutes: FastifyPluginAsync<CategoryRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (_req, reply) => {
    const rows = await db
      .select()
      .from(category)
      .orderBy(category.pid, category.sort, category.id);

    const counts = await db
      .select({ categoryId: vod.categoryId, total: sql<number>`COUNT(*)` })
      .from(vod)
      .groupBy(vod.categoryId);
    const countMap = new Map(counts.map((row) => [row.categoryId, Number(row.total)]));

    const parents = rows
      .filter((row) => row.pid === 0)
      .map((row) => ({
        ...row,
        vodCount: (countMap.get(row.id) ?? 0) +
          rows
            .filter((child) => child.pid === row.id)
            .reduce((sum, child) => sum + (countMap.get(child.id) ?? 0), 0),
        children: rows
          .filter((child) => child.pid === row.id)
          .map((child) => ({ ...child, vodCount: countMap.get(child.id) ?? 0, children: [] as never[] })),
      }));

    return ok(reply, { items: parents });
  });

  app.post('/', async (req, reply) => {
    const result = await validateBody(db, (req.body ?? {}) as CategoryBody, null);
    if ('error' in result) return fail(reply, 400, ErrorCode.BAD_REQUEST, result.error);

    const [created] = await db.insert(category).values(result.data).$returningId();
    return ok(reply, { id: created?.id ?? 0 });
  });

  app.put('/:id', async (req, reply) => {
    const id = toInt((req.params as { id?: string }).id, 0);
    if (id <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '分类不存在');

    const exists = await db.select({ id: category.id }).from(category).where(eq(category.id, id)).limit(1);
    if (exists.length === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '分类不存在');

    const result = await validateBody(db, (req.body ?? {}) as CategoryBody, id);
    if ('error' in result) return fail(reply, 400, ErrorCode.BAD_REQUEST, result.error);

    await db.update(category).set(result.data).where(eq(category.id, id));
    return ok(reply, null);
  });

  app.delete('/:id', async (req, reply) => {
    const id = toInt((req.params as { id?: string }).id, 0);
    if (id <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '分类不存在');

    const children = await db.select({ id: category.id }).from(category).where(eq(category.pid, id)).limit(1);
    if (children.length > 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请先删除该分类下的子分类');

    const usedByVod = await db.select({ id: vod.id }).from(vod).where(eq(vod.categoryId, id)).limit(1);
    if (usedByVod.length > 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '该分类下还有影片，不能删除');
    }

    const mappings = await db
      .select({ id: collectSourceCategory.id })
      .from(collectSourceCategory)
      .where(and(eq(collectSourceCategory.categoryId, id), eq(collectSourceCategory.status, 1)));
    const force = (req.query as { force?: string }).force === '1';
    if (mappings.length > 0 && !force) {
      return reply.code(409).send({
        code: 40900,
        msg: `该分类被 ${mappings.length} 个源站分类映射，删除后这些映射会被重置`,
        data: { mappingCount: mappings.length },
      });
    }

    if (mappings.length > 0) {
      await db
        .update(collectSourceCategory)
        .set({ categoryId: 0, status: 0, matchType: 0 })
        .where(eq(collectSourceCategory.categoryId, id));
    }

    await db.delete(category).where(eq(category.id, id));
    return ok(reply, null);
  });
};
