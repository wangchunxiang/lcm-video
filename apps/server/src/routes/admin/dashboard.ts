import type { FastifyPluginAsync } from 'fastify';
import { desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { category, collectLog, collectSource, collectTask, vod, vodPlay } from '@lcm/db';
import { ok } from '../../lib/http.ts';

export interface DashboardOpts {
  db: Db;
}

export const dashboardRoutes: FastifyPluginAsync<DashboardOpts> = async (app, opts) => {
  const { db } = opts;

  app.get('/', async (_req, reply) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [vodStats] = await db
      .select({
        total: sql<number>`count(*)`,
        enabled: sql<number>`sum(case when ${vod.status} = 1 then 1 else 0 end)`,
        disabled: sql<number>`sum(case when ${vod.status} = 0 then 1 else 0 end)`,
        today: sql<number>`sum(case when ${vod.collectedAt} >= ${todayStart} then 1 else 0 end)`,
      })
      .from(vod);

    const [playStats] = await db.select({ total: sql<number>`count(*)` }).from(vodPlay);
    const [categoryStats] = await db.select({ total: sql<number>`count(*)` }).from(category);
    const [sourceStats] = await db
      .select({
        total: sql<number>`count(*)`,
        enabled: sql<number>`sum(case when ${collectSource.isEnabled} = 1 then 1 else 0 end)`,
      })
      .from(collectSource);
    const [taskStats] = await db
      .select({
        total: sql<number>`count(*)`,
        enabled: sql<number>`sum(case when ${collectTask.isEnabled} = 1 then 1 else 0 end)`,
      })
      .from(collectTask);

    const [todayLogStats] = await db
      .select({
        runs: sql<number>`count(*)`,
        inserted: sql<number>`coalesce(sum(${collectLog.inserted}), 0)`,
        updated: sql<number>`coalesce(sum(${collectLog.updated}), 0)`,
        failed: sql<number>`coalesce(sum(${collectLog.failed}), 0)`,
      })
      .from(collectLog)
      .where(gte(collectLog.startedAt, todayStart));

    const recentLogs = await db
      .select({
        id: collectLog.id,
        taskName: collectTask.name,
        sourceName: collectSource.name,
        status: collectLog.status,
        total: collectLog.total,
        inserted: collectLog.inserted,
        updated: collectLog.updated,
        failed: collectLog.failed,
        startedAt: collectLog.startedAt,
        finishedAt: collectLog.finishedAt,
      })
      .from(collectLog)
      .leftJoin(collectTask, eq(collectTask.id, collectLog.taskId))
      .leftJoin(collectSource, eq(collectSource.id, collectLog.sourceId))
      .orderBy(desc(collectLog.id))
      .limit(8);

    const recentVods = await db
      .select({ id: vod.id, name: vod.name, status: vod.status, collectedAt: vod.collectedAt })
      .from(vod)
      .orderBy(desc(vod.id))
      .limit(8);

    const num = (value: unknown): number => Number(value ?? 0);

    return ok(reply, {
      vod: {
        total: num(vodStats?.total),
        enabled: num(vodStats?.enabled),
        disabled: num(vodStats?.disabled),
        today: num(vodStats?.today),
      },
      play: { total: num(playStats?.total) },
      category: { total: num(categoryStats?.total) },
      source: { total: num(sourceStats?.total), enabled: num(sourceStats?.enabled) },
      task: { total: num(taskStats?.total), enabled: num(taskStats?.enabled) },
      todayLog: {
        runs: num(todayLogStats?.runs),
        inserted: num(todayLogStats?.inserted),
        updated: num(todayLogStats?.updated),
        failed: num(todayLogStats?.failed),
      },
      recentLogs,
      recentVods,
    });
  });
};
