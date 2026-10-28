import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { adFeature } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { analyzeSource, pickSampleVods } from '../../lib/ads/analyze.ts';

export interface AdsRouteOpts {
  db: Db;
}

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function nowClock(): string {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export const adsRoutes: FastifyPluginAsync<AdsRouteOpts> = async (app, opts) => {
  const { db } = opts;

  /** 该源已有的广告特征 */
  app.get('/:id/ads', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    const rows = await db
      .select()
      .from(adFeature)
      .where(eq(adFeature.sourceId, sourceId))
      .orderBy(desc(adFeature.hitVods), desc(adFeature.totalMs));
    return ok(
      reply,
      rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        durations: row.durations,
        totalMs: row.totalMs,
        hitVods: row.hitVods,
        sample: row.sample,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    );
  });

  /** 随机抽 5 部作品，给前端做预览 */
  app.post('/:id/ads/pick', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    if (!sourceId) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少采集源');
    const items = await pickSampleVods(db, sourceId);
    return ok(reply, { items });
  });

  /** 执行分析，同步返回日志与结果 */
  app.post('/:id/ads/analyze', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    if (!sourceId) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少采集源');

    const logs: string[] = [];
    const log = (line: string) => logs.push(`[${nowClock()}] ${line}`);

    try {
      const { features, sampled } = await analyzeSource(db, sourceId, log);
      return ok(reply, { logs, features, sampled });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`分析失败：${msg}`);
      return fail(reply, 500, ErrorCode.SERVER_ERROR, msg);
    }
  });

  /** 确认 / 排除某条特征 */
  app.put('/:id/ads/:featureId', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    const featureId = toInt((req.params as { featureId?: string }).featureId);
    const status = toInt((req.body as { status?: unknown }).status);
    if (!sourceId || !featureId) return fail(reply, 400, ErrorCode.BAD_REQUEST, '参数不完整');
    if (status !== 0 && status !== 1 && status !== 2)
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '状态只能是 0、1 或 2');

    await db
      .update(adFeature)
      .set({ status, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(adFeature.id, featureId), eq(adFeature.sourceId, sourceId)));
    return ok(reply, null);
  });
};
