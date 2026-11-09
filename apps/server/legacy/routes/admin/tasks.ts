import { and, count, desc, eq, inArray, like } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { collectSource, collectTask } from '@lcm/db';
import { isValidCron, nextRunAt } from '../../lib/collect/cron.ts';
import { cancelRun, getRunningLogId, startTask } from '../../lib/collect/runner.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { toText } from '@lcm/shared';
import { toInt } from '@lcm/shared';

export interface TaskRouteOpts {
  db: Db;
}

interface TaskBody {
  name?: unknown;
  source_id?: unknown;
  range_type?: unknown;
  cron?: unknown;
  is_enabled?: unknown;
}

export const taskRoutes: FastifyPluginAsync<TaskRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    const conditions = [];
    const keyword = toText(query.keyword);
    if (keyword) conditions.push(like(collectTask.name, `%${keyword}%`));
    const sourceId = toInt(query.source_id);
    if (sourceId > 0) conditions.push(eq(collectTask.sourceId, sourceId));
    if (query.status === '0' || query.status === '1') {
      conditions.push(eq(collectTask.isEnabled, toInt(query.status)));
    }

    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toInt(query.page_size, 20)));

    const rows = await db
      .select({
        id: collectTask.id,
        name: collectTask.name,
        sourceId: collectTask.sourceId,
        sourceName: collectSource.name,
        rangeType: collectTask.rangeType,
        cron: collectTask.cron,
        isEnabled: collectTask.isEnabled,
        lastRunAt: collectTask.lastRunAt,
        lastRunStatus: collectTask.lastRunStatus,
        lastRunMsg: collectTask.lastRunMsg,
        createdAt: collectTask.createdAt,
      })
      .from(collectTask)
      .leftJoin(collectSource, eq(collectSource.id, collectTask.sourceId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(collectTask.createdAt), desc(collectTask.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items = rows.map((row) => ({
      ...row,
      runningLogId: getRunningLogId(row.id) ?? null,
      nextRunAt: row.cron && row.isEnabled === 1 ? nextRunAt(row.cron) : null,
    }));

    const totalRows = await db
      .select({ value: count() })
      .from(collectTask)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return ok(reply, { items, total: Number(totalRows[0]?.value ?? 0), page, page_size: pageSize });
  });

  app.post('/', async (req, reply) => {
    const body = (req.body ?? {}) as TaskBody;
    const name = toText(body.name);
    if (!name) return fail(reply, 400, ErrorCode.BAD_REQUEST, '任务名称不能为空');
    if (name.length > 50) return fail(reply, 400, ErrorCode.BAD_REQUEST, '任务名称不能超过 50 个字符');

    const sourceId = toInt(body.source_id);
    const source = await db.select({ id: collectSource.id }).from(collectSource).where(eq(collectSource.id, sourceId)).limit(1);
    if (!source[0]) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择有效的采集源');

    const rangeType = toInt(body.range_type, 1);
    if (rangeType < 1 || rangeType > 4) return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集范围不合法');

    const cron = toText(body.cron);
    if (cron) {
      const error = isValidCron(cron);
      if (error) return fail(reply, 400, ErrorCode.BAD_REQUEST, `cron 表达式不合法：${error}`);
    }

    const inserted = await db
      .insert(collectTask)
      .values({
        name,
        sourceId,
        rangeType,
        cron,
        isEnabled: body.is_enabled === 0 || body.is_enabled === false ? 0 : 1,
      })
      .$returningId();

    return ok(reply, { id: inserted[0]?.id ?? 0 });
  });

  app.put('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const rows = await db.select().from(collectTask).where(eq(collectTask.id, id)).limit(1);
    if (!rows[0]) return fail(reply, 404, ErrorCode.NOT_FOUND, '任务不存在');

    const body = (req.body ?? {}) as TaskBody;
    const patch: Partial<typeof collectTask.$inferInsert> = {};

    if (body.name !== undefined) {
      const name = toText(body.name);
      if (!name) return fail(reply, 400, ErrorCode.BAD_REQUEST, '任务名称不能为空');
      if (name.length > 50) return fail(reply, 400, ErrorCode.BAD_REQUEST, '任务名称不能超过 50 个字符');
      patch.name = name;
    }

    if (body.source_id !== undefined) {
      const sourceId = toInt(body.source_id);
      const source = await db
        .select({ id: collectSource.id })
        .from(collectSource)
        .where(eq(collectSource.id, sourceId))
        .limit(1);
      if (!source[0]) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择有效的采集源');
      patch.sourceId = sourceId;
    }

    if (body.range_type !== undefined) {
      const rangeType = toInt(body.range_type, 1);
      if (rangeType < 1 || rangeType > 4) return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集范围不合法');
      patch.rangeType = rangeType;
    }

    if (body.cron !== undefined) {
      const cron = toText(body.cron);
      if (cron) {
        const error = isValidCron(cron);
        if (error) return fail(reply, 400, ErrorCode.BAD_REQUEST, `cron 表达式不合法：${error}`);
      }
      patch.cron = cron;
    }

    if (body.is_enabled !== undefined) {
      patch.isEnabled = body.is_enabled === 0 || body.is_enabled === false ? 0 : 1;
    }

    await db.update(collectTask).set(patch).where(eq(collectTask.id, id));
    return ok(reply, { id });
  });

  app.delete('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const rows = await db.select({ id: collectTask.id }).from(collectTask).where(eq(collectTask.id, id)).limit(1);
    if (!rows[0]) return fail(reply, 404, ErrorCode.NOT_FOUND, '任务不存在');
    if (getRunningLogId(id) !== undefined) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '任务正在执行，请先取消');
    }
    await db.delete(collectTask).where(eq(collectTask.id, id));
    return ok(reply, { id });
  });

  app.post('/batch', async (req, reply) => {
    const body = (req.body ?? {}) as { action?: string; ids?: unknown[] };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value) => toInt(value)).filter((value) => value > 0)
      : [];
    if (ids.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请先选择任务');

    if (body.action === 'enable' || body.action === 'disable') {
      await db
        .update(collectTask)
        .set({ isEnabled: body.action === 'enable' ? 1 : 0 })
        .where(inArray(collectTask.id, ids));
      return ok(reply, { affected: ids.length });
    }

    if (body.action !== 'delete') {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '不支持的操作');
    }

    const runningIds = ids.filter((id) => getRunningLogId(id) !== undefined);
    if (runningIds.length > 0) {
      const runningRows = await db
        .select({ name: collectTask.name })
        .from(collectTask)
        .where(inArray(collectTask.id, runningIds));
      const names = runningRows.map((row) => row.name).join('、');
      return fail(reply, 400, ErrorCode.BAD_REQUEST, `${names} 正在执行，请先取消`);
    }

    await db.delete(collectTask).where(inArray(collectTask.id, ids));
    return ok(reply, { affected: ids.length });
  });

  app.post('/:id/run', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const result = await startTask(db, id);
    if (!result.started) return fail(reply, 400, ErrorCode.BAD_REQUEST, result.message);
    return ok(reply, { logId: result.logId ?? 0 });
  });

  app.post('/:id/cancel', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const logId = cancelRun(id);
    if (logId === undefined) return fail(reply, 400, ErrorCode.BAD_REQUEST, '该任务没有正在执行');
    return ok(reply, { logId });
  });
};
