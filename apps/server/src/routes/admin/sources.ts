import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { collectSource, collectSourceCategory, collectTask, vodPlay } from '@lcm/db';
import { CollectClient } from '../../lib/collect/client.ts';
import { autoMatchCategory, loadCategories } from '../../lib/collect/match.ts';
import { fetchClassList } from '../../lib/collect/classes.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

export interface SourceRouteOpts {
  db: Db;
}

const FORBIDDEN_PARAMS = ['ac', 'pg', 'pagesize', 'at', 'h'];

interface SourceBody {
  name?: unknown;
  api_url?: unknown;
  api_format?: unknown;
  api_params?: unknown;
  parse_url?: unknown;
  sort?: unknown;
  is_enabled?: unknown;
  interval_sec?: unknown;
  pagesize?: unknown;
  timeout?: unknown;
  retry_times?: unknown;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

/** 地址里的 /at/json/、/at/xml/ 片段与接口格式必须一致，否则服务端返回的格式与解析方式不符 */
function formatMismatch(apiUrl: string, apiFormat: string): string | null {
  if (/\/at\/json\/?/i.test(apiUrl) && apiFormat !== 'json') {
    return '接口地址里是 /at/json/，接口格式要选 json';
  }
  if (/\/at\/xml\/?/i.test(apiUrl) && apiFormat !== 'xml') {
    return '接口地址里是 /at/xml/，接口格式要选 xml';
  }
  return null;
}

function validateBody(body: SourceBody): { data: typeof collectSource.$inferInsert } | { error: string } {
  const name = toText(body.name);
  if (!name) return { error: '源站名称不能为空' };
  if (name.length > 50) return { error: '源站名称不能超过 50 个字符' };

  const apiUrl = toText(body.api_url);
  if (!apiUrl) return { error: '采集接口地址不能为空' };
  if (apiUrl.length > 255) return { error: '采集接口地址不能超过 255 个字符' };
  if (!isHttpUrl(apiUrl)) return { error: '采集接口地址必须以 http:// 或 https:// 开头' };

  const apiFormat = toText(body.api_format) || 'json';
  if (apiFormat !== 'json' && apiFormat !== 'xml') return { error: '接口类型只能是 json 或 xml' };

  const apiParams = toText(body.api_params);
  if (apiParams.length > 500) return { error: '额外参数不能超过 500 个字符' };
  if (apiParams) {
    const params = new URLSearchParams(apiParams.replace(/^\?/, ''));
    for (const key of FORBIDDEN_PARAMS) {
      if (params.has(key)) return { error: `额外参数不允许包含 ${key}，该参数由程序控制` };
    }
  }

  const parseUrl = toText(body.parse_url);
  if (parseUrl.length > 255) return { error: '解析接口地址不能超过 255 个字符' };
  if (parseUrl && !/^https?:\/\//i.test(parseUrl)) {
    return { error: '解析接口地址必须以 http:// 或 https:// 开头' };
  }

  const pagesize = toInt(body.pagesize, 100);
  if (pagesize < 1 || pagesize > 100) return { error: '每页条数必须在 1 到 100 之间' };

  const intervalSec = toInt(body.interval_sec, 3);
  if (intervalSec < 1 || intervalSec > 600) return { error: '请求间隔必须在 1 到 600 秒之间' };

  const timeout = toInt(body.timeout, 30);
  if (timeout < 1 || timeout > 300) return { error: '超时时间必须在 1 到 300 秒之间' };

  const retryTimes = toInt(body.retry_times, 2);
  if (retryTimes < 0 || retryTimes > 10) return { error: '重试次数必须在 0 到 10 之间' };

  const mismatch = formatMismatch(apiUrl, apiFormat);
  if (mismatch) return { error: mismatch };

  return {
    data: {
      name,
      apiUrl,
      apiFormat,
      apiParams,
      parseUrl,
      isEnabled: body.is_enabled === 0 || body.is_enabled === false ? 0 : 1,
      intervalSec,
      pagesize,
      timeout,
      retryTimes,
    },
  };
}

async function loadSource(db: Db, id: number): Promise<typeof collectSource.$inferSelect | null> {
  const rows = await db.select().from(collectSource).where(eq(collectSource.id, id)).limit(1);
  return rows[0] ?? null;
}

export const sourceRoutes: FastifyPluginAsync<SourceRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toInt(query.page_size, 20)));

    const conditions = [];
    const keyword = toText(query.keyword);
    if (keyword) conditions.push(like(collectSource.name, `%${keyword}%`));
    if (query.status === '0' || query.status === '1') {
      conditions.push(eq(collectSource.isEnabled, toInt(query.status)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countRows = await db.select({ total: sql<number>`count(*)` }).from(collectSource).where(where);
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await db
      .select()
      .from(collectSource)
      .where(where)
      .orderBy(desc(collectSource.createdAt), desc(collectSource.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return ok(reply, { items: rows, total, page, page_size: pageSize });
  });

  app.get('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const row = await loadSource(db, id);
    if (!row) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');
    return ok(reply, row);
  });

  app.post('/', async (req, reply) => {
    const parsed = validateBody((req.body ?? {}) as SourceBody);
    if ('error' in parsed) return fail(reply, 400, ErrorCode.BAD_REQUEST, parsed.error);
    const inserted = await db.insert(collectSource).values(parsed.data).$returningId();
    return ok(reply, { id: inserted[0]?.id ?? 0 });
  });

  app.put('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const exists = await loadSource(db, id);
    if (!exists) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const parsed = validateBody((req.body ?? {}) as SourceBody);
    if ('error' in parsed) return fail(reply, 400, ErrorCode.BAD_REQUEST, parsed.error);
    await db.update(collectSource).set(parsed.data).where(eq(collectSource.id, id));
    return ok(reply, { id });
  });

  app.delete('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const query = req.query as { force?: string };
    const exists = await loadSource(db, id);
    if (!exists) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const playRows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(vodPlay)
      .where(eq(vodPlay.sourceId, id));
    const plays = Number(playRows[0]?.count ?? 0);

    if (plays > 0 && query.force !== '1') {
      return reply.code(409).send({
        code: 40901,
        msg: `该源下有 ${plays} 条播放线路，删除后这些线路会被一并清除，相关影片若无其它线路将自动下架`,
        data: { plays },
      });
    }

    await db.transaction(async (tx) => {
      await tx.delete(vodPlay).where(eq(vodPlay.sourceId, id));
      await tx.delete(collectSourceCategory).where(eq(collectSourceCategory.sourceId, id));
      await tx.delete(collectTask).where(eq(collectTask.sourceId, id));
      await tx.delete(collectSource).where(eq(collectSource.id, id));
      await tx.execute(sql`
        UPDATE lcm_vod SET status = 0
        WHERE status = 1 AND id NOT IN (SELECT vod_id FROM lcm_vod_play)
      `);
    });

    return ok(reply, { id, plays });
  });

  app.post('/batch', async (req, reply) => {
    const body = (req.body ?? {}) as { action?: string; ids?: unknown[]; force?: boolean };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value) => toInt(value)).filter((value) => value > 0)
      : [];
    if (ids.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请先选择采集源');

    if (body.action === 'enable' || body.action === 'disable') {
      await db
        .update(collectSource)
        .set({ isEnabled: body.action === 'enable' ? 1 : 0 })
        .where(inArray(collectSource.id, ids));
      return ok(reply, { affected: ids.length });
    }

    if (body.action !== 'delete') {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '不支持的操作');
    }

    const playRows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(vodPlay)
      .where(inArray(vodPlay.sourceId, ids));
    const plays = Number(playRows[0]?.count ?? 0);

    if (plays > 0 && body.force !== true) {
      return reply.code(409).send({
        code: 40901,
        msg: `选中的 ${ids.length} 个源下有 ${plays} 条播放线路，删除后这些线路会被一并清除，相关影片若无其它线路将自动下架`,
        data: { plays, sources: ids.length },
      });
    }

    await db.transaction(async (tx) => {
      await tx.delete(vodPlay).where(inArray(vodPlay.sourceId, ids));
      await tx.delete(collectSourceCategory).where(inArray(collectSourceCategory.sourceId, ids));
      await tx.delete(collectTask).where(inArray(collectTask.sourceId, ids));
      await tx.delete(collectSource).where(inArray(collectSource.id, ids));
      await tx.execute(sql`
        UPDATE lcm_vod SET status = 0
        WHERE status = 1 AND id NOT IN (SELECT vod_id FROM lcm_vod_play)
      `);
    });

    return ok(reply, { affected: ids.length, plays });
  });

  app.post('/:id/test', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const source = await loadSource(db, id);
    if (!source) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const client = new CollectClient(source);
    const startedAt = Date.now();
    try {
      const { classes, via } = await fetchClassList(client, source);
      return ok(reply, {
        ok: true,
        elapsed_ms: Date.now() - startedAt,
        categories: classes.length,
        via,
        sample: classes.slice(0, 5).map((item) => item.typeName),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return ok(reply, { ok: false, elapsed_ms: Date.now() - startedAt, message });
    }
  });

  app.post('/:id/fetch-categories', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const source = await loadSource(db, id);
    if (!source) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集源不存在');

    const client = new CollectClient(source);
    let classes;
    try {
      classes = (await fetchClassList(client, source)).classes;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(collectSource)
        .set({ lastSyncAt: sql`NOW()`, lastSyncStatus: 2, lastSyncMsg: message.slice(0, 255) })
        .where(eq(collectSource.id, id));
      return fail(reply, 400, ErrorCode.BAD_REQUEST, `获取分类失败：${message}`);
    }

    if (classes.length === 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '接口没有返回分类数据（需要 ac=list 且响应带 class）');
    }

    const rows = classes.map((item) => ({
      sourceId: id,
      sourceTypeId: item.typeId,
      sourceTypeName: item.typeName,
      sourceTypePid: item.typePid,
    }));

    for (let i = 0; i < rows.length; i += 200) {
      await db
        .insert(collectSourceCategory)
        .values(rows.slice(i, i + 200))
        .onDuplicateKeyUpdate({
          set: {
            sourceTypeName: sql`VALUES(source_type_name)`,
            sourceTypePid: sql`VALUES(source_type_pid)`,
          },
        });
    }

    // 未映射的分类自动匹配一次
    const pending = await db
      .select({
        id: collectSourceCategory.id,
        sourceTypeName: collectSourceCategory.sourceTypeName,
      })
      .from(collectSourceCategory)
      .where(
        and(
          eq(collectSourceCategory.sourceId, id),
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

    const totalRows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(collectSourceCategory)
      .where(eq(collectSourceCategory.sourceId, id));

    const mappedRows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(collectSourceCategory)
      .where(and(eq(collectSourceCategory.sourceId, id), eq(collectSourceCategory.status, 1)));

    const summary = `获取到 ${classes.length} 个分类，本次自动匹配 ${matched} 个`;
    await db
      .update(collectSource)
      .set({ lastSyncAt: sql`NOW()`, lastSyncStatus: 1, lastSyncMsg: summary.slice(0, 255) })
      .where(eq(collectSource.id, id));

    return ok(reply, {
      total: Number(totalRows[0]?.count ?? 0),
      mapped: Number(mappedRows[0]?.count ?? 0),
      fetched: classes.length,
      matched,
    });
  });
};
