import type { FastifyPluginAsync } from 'fastify';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { vod, vodPlay } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../../lib/http.ts';
import type { ToolOpts } from './index.ts';

/** 数据维护：地址批量替换、按源删除线路、清理无线路影片 */
export const dataRoutes: FastifyPluginAsync<ToolOpts> = async (app, opts) => {
  const { db } = opts;

  /** 播放地址替换的范围条件：指定源只动该源的线路，0 表示全部 */
  const playScope = (from: string, sourceId: number) =>
    sourceId > 0
      ? and(like(vodPlay.playUrl, `%${from}%`), eq(vodPlay.sourceId, sourceId))
      : like(vodPlay.playUrl, `%${from}%`);


  const toSourceId = (value: unknown): number | null => {
    const id = Number(value ?? 0);
    if (!Number.isInteger(id) || id < 0) return null;
    return id;
  };

  /** 预览：批量替换会命中多少条线路 */
  app.post('/replace-play-url/preview', async (req, reply) => {
    const body = (req.body ?? {}) as { from?: string; source_id?: number };
    const from = (body.from ?? '').trim();
    const sourceId = toSourceId(body.source_id);
    if (!from) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请填写要查找的地址前缀');
    if (sourceId === null) return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集源不正确');

    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(vodPlay)
      .where(playScope(from, sourceId));

    return ok(reply, { total: Number(row?.total ?? 0) });
  });

  /** 批量替换播放地址前缀 */
  app.post('/replace-play-url', async (req, reply) => {
    const body = (req.body ?? {}) as {
      from?: string;
      to?: string;
      source_id?: number;
      confirm?: boolean;
    };
    const from = (body.from ?? '').trim();
    const to = (body.to ?? '').trim();
    const sourceId = toSourceId(body.source_id);
    if (!from) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请填写要查找的地址前缀');
    if (sourceId === null) return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集源不正确');
    if (from === to) return fail(reply, 400, ErrorCode.BAD_REQUEST, '替换前后的内容不能相同');

    if (!body.confirm) {
      const [row] = await db
        .select({ total: sql<number>`count(*)` })
        .from(vodPlay)
        .where(playScope(from, sourceId));
      return ok(reply, { needConfirm: true, total: Number(row?.total ?? 0) });
    }

    const result = await db
      .update(vodPlay)
      .set({ playUrl: sql`replace(${vodPlay.playUrl}, ${from}, ${to})` })
      .where(playScope(from, sourceId));

    const affected = Number(
      (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0,
    );
    return ok(reply, { affected });
  });

  /** 预览：批量替换封面地址会命中多少部影片 */
  app.post('/replace-cover-url/preview', async (req, reply) => {
    const body = (req.body ?? {}) as { from?: string };
    const from = (body.from ?? '').trim();
    if (!from) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请填写要查找的图片地址前缀');

    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(vod)
      .where(like(vod.cover, `%${from}%`));

    return ok(reply, { total: Number(row?.total ?? 0) });
  });

  /** 批量替换封面图片地址前缀 */
  app.post('/replace-cover-url', async (req, reply) => {
    const body = (req.body ?? {}) as {
      from?: string;
      to?: string;
      confirm?: boolean;
    };
    const from = (body.from ?? '').trim();
    const to = (body.to ?? '').trim();
    if (!from) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请填写要查找的图片地址前缀');
    if (from === to) return fail(reply, 400, ErrorCode.BAD_REQUEST, '替换前后的内容不能相同');

    if (!body.confirm) {
      const [row] = await db
        .select({ total: sql<number>`count(*)` })
        .from(vod)
        .where(like(vod.cover, `%${from}%`));
      return ok(reply, { needConfirm: true, total: Number(row?.total ?? 0) });
    }

    const result = await db
      .update(vod)
      .set({ cover: sql`replace(${vod.cover}, ${from}, ${to})` })
      .where(like(vod.cover, `%${from}%`));

    const affected = Number(
      (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0,
    );
    return ok(reply, { affected });
  });

  /** 删除某个采集源的全部线路（手工线路 source_id=0 不受影响） */
  app.post('/delete-source-plays', async (req, reply) => {
    const body = (req.body ?? {}) as { source_id?: number; confirm?: boolean };
    const sourceId = Number(body.source_id ?? 0);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择要清理的采集源');
    }

    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(vodPlay)
      .where(eq(vodPlay.sourceId, sourceId));
    const total = Number(row?.total ?? 0);

    if (!body.confirm) return ok(reply, { needConfirm: true, total });

    const affectedVods = await db
      .select({ vodId: vodPlay.vodId })
      .from(vodPlay)
      .where(eq(vodPlay.sourceId, sourceId))
      .groupBy(vodPlay.vodId);

    await db.delete(vodPlay).where(eq(vodPlay.sourceId, sourceId));

    // 失去全部线路的影片自动下架
    let offline = 0;
    const vodIds = affectedVods.map((item) => item.vodId);
    for (let i = 0; i < vodIds.length; i += 500) {
      const chunk = vodIds.slice(i, i + 500);
      const rows = await db
        .select({ vodId: vodPlay.vodId })
        .from(vodPlay)
        .where(inArray(vodPlay.vodId, chunk))
        .groupBy(vodPlay.vodId);
      const alive = new Set(rows.map((item) => item.vodId));
      const dead = chunk.filter((id) => !alive.has(id));
      if (dead.length > 0) {
        await db.update(vod).set({ status: 0 }).where(inArray(vod.id, dead));
        offline += dead.length;
      }
    }

    return ok(reply, { affected: total, offline });
  });

  /** 预览：没有线路的在架影片 */
  app.get('/clean-vods/preview', async (_req, reply) => {
    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(vod)
      .leftJoin(vodPlay, eq(vodPlay.vodId, vod.id))
      .where(sql`${vodPlay.id} is null`);
    return ok(reply, { total: Number(row?.total ?? 0) });
  });

  /** 清理无线路影片：默认下架，可选手工删除 */  app.post('/clean-vods', async (req, reply) => {
    const body = (req.body ?? {}) as { mode?: string; confirm?: boolean };
    const mode = body.mode === 'delete' ? 'delete' : 'offline';

    const rows = await db
      .select({ id: vod.id })
      .from(vod)
      .leftJoin(vodPlay, eq(vodPlay.vodId, vod.id))
      .where(sql`${vodPlay.id} is null`);
    const ids = rows.map((item) => item.id);

    if (!body.confirm) return ok(reply, { needConfirm: true, total: ids.length, mode });
    if (ids.length === 0) return ok(reply, { affected: 0, mode });

    let affected = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      if (mode === 'delete') {
        await db.delete(vod).where(inArray(vod.id, chunk));
      } else {
        await db.update(vod).set({ status: 0 }).where(inArray(vod.id, chunk));
      }
      affected += chunk.length;
    }

    return ok(reply, { affected, mode });
  });
};
