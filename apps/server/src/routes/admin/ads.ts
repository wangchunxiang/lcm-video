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

  /** 该源已确认的广告特征 */
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

  /** 执行分析，边跑边以 NDJSON 流式推送日志 */
  app.post('/:id/ads/analyze-stream', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    if (!sourceId) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少采集源');

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });

    const send = (payload: unknown) => res.write(`${JSON.stringify(payload)}
`);

    try {
      const { features, sampled } = await analyzeSource(db, sourceId, (text) => {
        send({ type: 'log', text });
      });
      send({ type: 'result', features, sampled });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      send({ type: 'error', message: msg });
    } finally {
      res.end();
    }
  });

  /** 人工确认一条候选，落库 */
  app.post('/:id/ads', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    if (!sourceId) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少采集源');
    const body = req.body as {
      durations?: unknown;
      kind?: unknown;
      totalMs?: unknown;
      hitVods?: unknown;
      sample?: unknown;
    };
    const durations = typeof body.durations === 'string' ? body.durations.trim() : '';
    if (!durations) return fail(reply, 400, ErrorCode.BAD_REQUEST, '缺少时长序列');

    await db
      .insert(adFeature)
      .values({
        sourceId,
        kind: toInt(body.kind) || 2,
        durations,
        totalMs: toInt(body.totalMs),
        hitVods: toInt(body.hitVods),
        sample: body.sample ?? [],
      })
      .onDuplicateKeyUpdate({
        set: {
          kind: toInt(body.kind) || 2,
          totalMs: toInt(body.totalMs),
          hitVods: toInt(body.hitVods),
          sample: body.sample ?? [],
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
    return ok(reply, null);
  });

  /** 撤销：删除已确认的特征 */
  app.delete('/:id/ads/:featureId', async (req, reply) => {
    const sourceId = toInt((req.params as { id?: string }).id);
    const featureId = toInt((req.params as { featureId?: string }).featureId);
    if (!sourceId || !featureId) return fail(reply, 400, ErrorCode.BAD_REQUEST, '参数不完整');
    await db.delete(adFeature).where(and(eq(adFeature.id, featureId), eq(adFeature.sourceId, sourceId)));
    return ok(reply, null);
  });
};
