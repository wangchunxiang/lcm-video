import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { collectLog, collectLogDetail, collectSource, collectTask } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

export interface LogRouteOpts {
  db: Db;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function pageOf(query: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, toInt(query.page, 1));
  const raw = toInt(query.page_size, 20);
  const pageSize = Math.min(100, Math.max(1, raw));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const logRoutes: FastifyPluginAsync<LogRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (req, reply) => {
    const query = (req.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = pageOf(query);

    const conditions = [];
    const taskId = toInt(query.task_id, 0);
    const sourceId = toInt(query.source_id, 0);
    if (taskId > 0) conditions.push(eq(collectLog.taskId, taskId));
    if (sourceId > 0) conditions.push(eq(collectLog.sourceId, sourceId));
    if (query.status !== undefined && query.status !== '') {
      conditions.push(eq(collectLog.status, toInt(query.status, 0)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: collectLog.id,
        taskId: collectLog.taskId,
        taskName: collectTask.name,
        sourceId: collectLog.sourceId,
        sourceName: collectSource.name,
        status: collectLog.status,
        total: collectLog.total,
        inserted: collectLog.inserted,
        updated: collectLog.updated,
        skipped: collectLog.skipped,
        ignored: collectLog.ignored,
        failed: collectLog.failed,
        message: collectLog.message,
        startedAt: collectLog.startedAt,
        finishedAt: collectLog.finishedAt,
      })
      .from(collectLog)
      .leftJoin(collectTask, eq(collectTask.id, collectLog.taskId))
      .leftJoin(collectSource, eq(collectSource.id, collectLog.sourceId))
      .where(where)
      .orderBy(desc(collectLog.id))
      .limit(pageSize)
      .offset(offset);

    const counted = await db.select({ count: sql<number>`COUNT(*)` }).from(collectLog).where(where);

    return ok(reply, {
      items: rows,
      total: Number(counted[0]?.count ?? 0),
      page,
      page_size: pageSize,
    });
  });

  app.get('/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    const query = (req.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = pageOf(query);

    const rows = await db
      .select({
        id: collectLog.id,
        taskId: collectLog.taskId,
        taskName: collectTask.name,
        sourceId: collectLog.sourceId,
        sourceName: collectSource.name,
        status: collectLog.status,
        total: collectLog.total,
        inserted: collectLog.inserted,
        updated: collectLog.updated,
        skipped: collectLog.skipped,
        ignored: collectLog.ignored,
        failed: collectLog.failed,
        message: collectLog.message,
        startedAt: collectLog.startedAt,
        finishedAt: collectLog.finishedAt,
      })
      .from(collectLog)
      .leftJoin(collectTask, eq(collectTask.id, collectLog.taskId))
      .leftJoin(collectSource, eq(collectSource.id, collectLog.sourceId))
      .where(eq(collectLog.id, id))
      .limit(1);

    const log = rows[0];
    if (!log) return fail(reply, 404, ErrorCode.NOT_FOUND, '采集记录不存在');

    const details = await db
      .select()
      .from(collectLogDetail)
      .where(eq(collectLogDetail.logId, id))
      .orderBy(desc(collectLogDetail.page))
      .limit(pageSize)
      .offset(offset);

    const counted = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(collectLogDetail)
      .where(eq(collectLogDetail.logId, id));

    return ok(reply, {
      log,
      items: details,
      total: Number(counted[0]?.count ?? 0),
      page,
      page_size: pageSize,
    });
  });
};
