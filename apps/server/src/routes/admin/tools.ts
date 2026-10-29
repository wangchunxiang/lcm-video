import type { FastifyPluginAsync } from 'fastify';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { vod, vodPlay } from '@lcm/db';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

export interface ToolOpts {
  db: Db;
}

export const toolRoutes: FastifyPluginAsync<ToolOpts> = async (app, opts) => {
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
  interface MergeMember {
    id: number;
    name: string;
    year: number;
    status: number;
    playCount: number;
    collectedAt: string;
  }

  interface MergeGroup {
    key: string;
    name: string;
    year: number;
    members: MergeMember[];
    playTotal: number;
  }

  type Column = 'name_hash' | 'name_hash_loose';

  /** 按指定哈希列取重复分组，附带每条影片的线路数与采集时间 */
  const loadGroups = async (column: Column): Promise<MergeGroup[]> => {
    const [hashRows] = await db.execute(
      sql`SELECT ${sql.raw(column)} AS k FROM lcm_vod WHERE ${sql.raw(column)} <> '' GROUP BY ${sql.raw(column)} HAVING COUNT(*) > 1`,
    );
    const keys = (hashRows as unknown as Array<{ k: string }>).map((row) => row.k);
    if (keys.length === 0) return [];

    const [rawRows] = await db.execute(
      sql`SELECT v.id, v.name, v.year, v.status, v.${sql.raw(column)} AS k,
            DATE_FORMAT(v.collected_at, '%Y-%m-%d %H:%i:%s') AS collected_at,
            (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS play_count
          FROM lcm_vod v WHERE v.${sql.raw(column)} IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})`,
    );
    const rows = rawRows as unknown as Array<{
      id: number;
      name: string;
      year: number;
      status: number;
      k: string;
      collected_at: string;
      play_count: number;
    }>;

    const byKey = new Map<string, MergeMember[]>();
    for (const row of rows) {
      const list = byKey.get(row.k) ?? [];
      list.push({
        id: Number(row.id),
        name: row.name,
        year: Number(row.year) || 0,
        status: Number(row.status) || 0,
        playCount: Number(row.play_count) || 0,
        collectedAt: row.collected_at,
      });
      byKey.set(row.k, list);
    }

    const groups: MergeGroup[] = [];
    for (const [key, members] of byKey) {
      members.sort((a, b) => a.id - b.id);
      groups.push({
        key,
        name: members[0]?.name ?? '',
        year: members.find((item) => item.year > 0)?.year ?? 0,
        members,
        playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
      });
    }
    return groups.sort((a, b) => b.members.length - a.members.length || a.members[0]!.id - b.members[0]!.id);
  };

  /** 年份相容：所有非 0 年份相同 */
  const yearCompatible = (members: MergeMember[]): boolean => {
    const years = new Set(members.map((item) => item.year).filter((year) => year > 0));
    return years.size <= 1;
  };

  /** 合并一组：保留线路最多（并列取 id 最小）的一条，其余线路并过去后删掉 */
  const mergeGroup = async (members: MergeMember[]): Promise<number> => {
    const sorted = [...members].sort((a, b) => b.playCount - a.playCount || a.id - b.id);
    const keep = sorted[0]!;
    const others = sorted.slice(1).map((item) => item.id);
    if (others.length === 0) return 0;

    const idList = sql.join(others.map((id) => sql`${id}`), sql`, `);
    const latest = sorted.map((item) => item.collectedAt).sort().at(-1) ?? null;

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO lcm_vod_play
              (vod_id, source_id, source_from, play_url, source_vod_id, source_updated_at, collected_at)
            SELECT ${keep.id}, source_id, source_from, play_url, source_vod_id, source_updated_at, collected_at
            FROM lcm_vod_play WHERE vod_id IN (${idList})
            ON DUPLICATE KEY UPDATE
              source_vod_id = IF(CHAR_LENGTH(VALUES(play_url)) > CHAR_LENGTH(play_url), VALUES(source_vod_id), source_vod_id),
              play_url = IF(CHAR_LENGTH(VALUES(play_url)) > CHAR_LENGTH(play_url), VALUES(play_url), play_url)`,
      );
      await tx.execute(sql`DELETE FROM lcm_vod_play WHERE vod_id IN (${idList})`);
      if (latest) {
        await tx.execute(
          sql`UPDATE lcm_vod SET collected_at = GREATEST(collected_at, ${latest}) WHERE id = ${keep.id}`,
        );
      }
      await tx.execute(sql`DELETE FROM lcm_vod WHERE id IN (${idList})`);
    });

    return others.length;
  };

  /** 预览：可自动合并的分组 + 疑似重复（宽松键相同但严格键不同） */
  app.get('/merge-vods/preview', async (_req, reply) => {
    const [strictGroups, looseGroups] = await Promise.all([
      loadGroups('name_hash'),
      loadGroups('name_hash_loose'),
    ]);

    const auto = strictGroups.filter((group) => yearCompatible(group.members));
    const conflict = strictGroups.filter((group) => !yearCompatible(group.members));
    const suspects = looseGroups.filter(
      (group) => new Set(group.members.map((item) => item.name)).size > 1 && group.members.length > 1,
    );

    return ok(reply, {
      auto,
      conflictCount: conflict.length,
      conflictExamples: conflict.slice(0, 20),
      suspects,
      summary: {
        autoGroups: auto.length,
        autoVods: auto.reduce((sum, group) => sum + group.members.length - 1, 0),
        suspectGroups: suspects.length,
        conflictGroups: conflict.length,
      },
    });
  });

  /** 合并指定的一组影片 */
  app.post('/merge-vods', async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: number[] };
    const ids = (Array.isArray(body.ids) ? body.ids : []).map((id) => Number(id)).filter((id) => id > 0);
    if (ids.length < 2) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请至少选择两条影片');

    const [rawRows] = await db.execute(
      sql`SELECT v.id, v.name, v.year, v.status,
            DATE_FORMAT(v.collected_at, '%Y-%m-%d %H:%i:%s') AS collected_at,
            (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS play_count
          FROM lcm_vod v WHERE v.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
    );
    const members = (rawRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      year: Number(row.year) || 0,
      status: Number(row.status) || 0,
      playCount: Number(row.play_count) || 0,
      collectedAt: String(row.collected_at),
    }));

    const merged = await mergeGroup(members);
    return ok(reply, { merged });
  });

  /** 一键合并全部可自动合并的分组 */
  app.post('/merge-vods/batch', async (req, reply) => {
    const body = (req.body ?? {}) as { confirm?: boolean };
    const auto = (await loadGroups('name_hash')).filter((group) => yearCompatible(group.members));

    if (!body.confirm) {
      return ok(reply, {
        needConfirm: true,
        groups: auto.length,
        vods: auto.reduce((sum, group) => sum + group.members.length - 1, 0),
      });
    }

    let merged = 0;
    for (const group of auto) {
      merged += await mergeGroup(group.members);
    }
    return ok(reply, { groups: auto.length, merged });
  });
};
