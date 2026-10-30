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
    cover: string;
    playCount: number;
    collectedAt: string;
    strictKey: string;
    lines: MergeLine[];
    subName?: string;
    category?: string;
    area?: string;
    lang?: string;
    actor?: string;
    episodeCount?: number;
  }

  interface MergeLine {
    sourceId: number;
    sourceFrom: string;
    sourceName: string;
    episodes?: number;
    updatedAt?: string;
  }

  interface MergeGroup {
    key: string;
    kind: 'auto' | 'suspect' | 'same';
    name: string;
    year: number;
    members: MergeMember[];
    playTotal: number;
    /** 判定依据：strict=严格键相同；actor=宽松键 + 年份 + 演员重合 */
    matchedBy?: 'strict' | 'actor';
    /** 演员重合率 0-1，仅 matchedBy=actor 时有意义 */
    actorOverlap?: number;
  }

  type Column = 'name_hash' | 'name_hash_loose';

  /** 被忽略的重复分组，键为「类型:哈希」 */
  const ignoreKey = (kind: string, key: string): string => `${kind}:${key}`;

  const loadIgnored = async (): Promise<Set<string>> => {
    const [rows] = await db.execute(sql`SELECT merge_key FROM lcm_vod_merge_ignore`);
    return new Set((rows as unknown as Array<{ merge_key: string }>).map((row) => row.merge_key));
  };

  /** 按指定哈希列取重复分组 */
  const loadGroups = async (column: Column, kind: 'auto' | 'suspect'): Promise<MergeGroup[]> => {
    const [hashRows] = await db.execute(
      sql`SELECT ${sql.raw(column)} AS k FROM lcm_vod WHERE ${sql.raw(column)} <> '' GROUP BY ${sql.raw(column)} HAVING COUNT(*) > 1`,
    );
    const keys = (hashRows as unknown as Array<{ k: string }>).map((row) => row.k);
    if (keys.length === 0) return [];

    const [rawRows] = await db.execute(
      sql`SELECT v.id, v.name, v.year, v.status, v.cover, v.name_hash, v.${sql.raw(column)} AS k,
            v.actor,
            DATE_FORMAT(v.collected_at, '%Y-%m-%d %H:%i:%s') AS collected_at,
            (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS play_count
          FROM lcm_vod v WHERE v.${sql.raw(column)} IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})`,
    );
    const rows = rawRows as unknown as Array<{
      id: number;
      name: string;
      year: number;
      status: number;
      cover: string;
      k: string;
      name_hash: string;
      actor: string | null;
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
        cover: row.cover ?? '',
        playCount: Number(row.play_count) || 0,
        collectedAt: row.collected_at,
        strictKey: row.name_hash,
        lines: [],
        actor: row.actor ?? '',
      });
      byKey.set(row.k, list);
    }

    const groups: MergeGroup[] = [];
    for (const [key, members] of byKey) {
      members.sort((a, b) => a.id - b.id);
      groups.push({
        key,
        kind,
        name: members[0]?.name ?? '',
        year: members.find((item) => item.year > 0)?.year ?? 0,
        members,
        playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
      });
    }
    return groups;
  };

  /** 年份相容：所有非 0 年份相同 */
  const yearCompatible = (members: MergeMember[]): boolean => {
    const years = new Set(members.map((item) => item.year).filter((year) => year > 0));
    return years.size <= 1;
  };

  /**
   * 宽松键组按年份拆簇：同名但年份不同视为不同作品。
   * 只有一个非 0 年份时原样返回；多个年份时按年份切开，键加 `#年份` 后缀。
   * 年份为 0 的记录只在单一年份时跟着走，多簇时不参与（无法判定归属）。
   */
  const splitByYear = (group: MergeGroup): MergeGroup[] => {
    const years = [...new Set(group.members.map((item) => item.year).filter((year) => year > 0))].sort(
      (a, b) => a - b,
    );
    if (years.length <= 1) return [group];
    return years.map((year) => {
      const members = group.members.filter((item) => item.year === year);
      return {
        ...group,
        key: `${group.key}#${year}`,
        name: members[0]?.name ?? group.name,
        year,
        members,
        playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
      };
    });
  };


  const actorSet = (text?: string): Set<string> => {
    const raw = String(text ?? '');
    // 有的源用空格分隔（"法老 小精灵 王瀚哲"），有的用逗号。带逗号时按逗号分，
    // 否则按空白分——这样带逗号的源里 "Poppy Ratchapong" 这类英文名不会被拆碎。
    const separator = /[,，、/]/.test(raw) ? /[,，、/]+/ : /\s+/;
    return new Set(
      raw
        .split(separator)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
  };

  /** 组内两两比较演员名单，取最小重合率；有一方为空则返回 0（不足以下结论） */
  const actorOverlap = (members: MergeMember[]): number => {
    const sets = members.map((item) => actorSet(item.actor));
    if (sets.some((set) => set.size === 0)) return 0;
    let min = 1;
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        const left = sets[i]!;
        const right = sets[j]!;
        let hit = 0;
        for (const name of left) if (right.has(name)) hit += 1;
        const ratio = hit / Math.min(left.size, right.size);
        if (ratio < min) min = ratio;
      }
    }
    return min;
  };

  /** 演员判定阈值：短名单里有 60% 出现在对方名单里 */
  const ACTOR_MATCH_MIN = 0.6;

  /** 宽松键组能否按「名称 + 年份 + 演员」升级为可合并 */
  const actorMatched = (group: MergeGroup): boolean =>
    group.members.length > 1 && yearCompatible(group.members) && actorOverlap(group.members) >= ACTOR_MATCH_MIN;

  /** 分组的默认保留项：线路最多，并列取 id 最小 */
  const defaultKeep = (members: MergeMember[]): MergeMember =>
    [...members].sort((a, b) => b.playCount - a.playCount || a.id - b.id)[0]!;

  /** 合并一组：keepId 指定保留项，其余线路并过去后删掉 */
  const mergeGroup = async (members: MergeMember[], keepId?: number): Promise<number> => {
    const keep = members.find((item) => item.id === keepId) ?? defaultKeep(members);
    const others = members.filter((item) => item.id !== keep.id).map((item) => item.id);
    if (others.length === 0) return 0;

    const idList = sql.join(others.map((id) => sql`${id}`), sql`, `);
    const latest = members.map((item) => item.collectedAt).sort().at(-1) ?? null;

    await db.transaction(async (tx) => {
      // 逐条搬线路：INSERT … SELECT 在 MySQL 里同一张表既当源又当目标，
      // ON DUPLICATE UPDATE 中的列名会报 ambiguous，所以先查出来再逐条写。
      const [rawLines] = await tx.execute(
        sql`SELECT source_id, source_from, play_url, source_vod_id, source_updated_at, collected_at
            FROM lcm_vod_play WHERE vod_id IN (${idList})`,
      );
      const lines = rawLines as unknown as Array<Record<string, unknown>>;
      for (const line of lines) {
        await tx.execute(
          sql`INSERT INTO lcm_vod_play
                (vod_id, source_id, source_from, play_url, source_vod_id, source_updated_at, collected_at)
              VALUES (${keep.id}, ${Number(line.source_id)}, ${String(line.source_from)}, ${String(line.play_url)},
                ${line.source_vod_id === null ? null : String(line.source_vod_id)},
                ${line.source_updated_at ?? null}, ${line.collected_at ?? null})
              ON DUPLICATE KEY UPDATE
                source_vod_id = IF(CHAR_LENGTH(VALUES(play_url)) > CHAR_LENGTH(play_url), VALUES(source_vod_id), source_vod_id),
                play_url = IF(CHAR_LENGTH(VALUES(play_url)) > CHAR_LENGTH(play_url), VALUES(play_url), play_url)`,
        );
      }
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

  /** 取一组重复影片，含线路来源，用于右侧对比 */
  /** 按 id 列表取成员（含线路来源） */
  const loadMembersByIds = async (ids: number[]): Promise<MergeMember[]> => {
    if (ids.length === 0) return [];
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    const [rawRows] = await db.execute(
      sql`SELECT v.id, v.name, v.sub_name, v.year, v.status, v.cover, v.name_hash,
            v.area, v.lang, v.actor, v.episode_count, c.name AS category_name,
            DATE_FORMAT(v.collected_at, '%Y-%m-%d %H:%i:%s') AS collected_at,
            (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS play_count
          FROM lcm_vod v LEFT JOIN lcm_category c ON c.id = v.category_id
          WHERE v.id IN (${idList}) ORDER BY v.id`,
    );
    const rows = rawRows as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    const [lineRows] = await db.execute(
      sql`SELECT p.vod_id, p.source_id, p.source_from, s.name AS source_name, p.source_updated_at,
            CASE WHEN p.play_url = '' THEN 0
                 ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END AS episodes
          FROM lcm_vod_play p LEFT JOIN lcm_collect_source s ON s.id = p.source_id
          WHERE p.vod_id IN (${idList})
          ORDER BY p.source_id, p.id`,
    );
    const linesByVod = new Map<number, MergeLine[]>();
    for (const row of lineRows as unknown as Array<Record<string, unknown>>) {
      const vodId = Number(row.vod_id);
      const list = linesByVod.get(vodId) ?? [];
      list.push({
        sourceId: Number(row.source_id),
        sourceFrom: String(row.source_from),
        sourceName: row.source_name ? String(row.source_name) : '手工添加',
        episodes: Number(row.episodes) || 0,
        updatedAt: row.source_updated_at
          ? String(row.source_updated_at).slice(0, 10)
          : '',
      });
      linesByVod.set(vodId, list);
    }

    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      year: Number(row.year) || 0,
      status: Number(row.status) || 0,
      cover: row.cover ? String(row.cover) : '',
      playCount: Number(row.play_count) || 0,
      collectedAt: String(row.collected_at),
      strictKey: String(row.name_hash),
      lines: linesByVod.get(Number(row.id)) ?? [],
      subName: row.sub_name ? String(row.sub_name) : '',
      category: row.category_name ? String(row.category_name) : '',
      area: row.area ? String(row.area) : '',
      lang: row.lang ? String(row.lang) : '',
      actor: row.actor ? String(row.actor) : '',
      episodeCount: Number(row.episode_count) || 0,
    }));
  };

  interface SameSourceGroup {
    key: string;
    name: string;
    year: number;
    count: number;
    playTotal: number;
    vodIds: number[];
  }

  /** 同源同 source_vod_id 却挂在多部影片上的分组：这是铁证重复，不需要人工判断 */
  const loadSameSourceGroups = async (): Promise<SameSourceGroup[]> => {
    const [rawRows] = await db.execute(
      sql`SELECT source_id, source_vod_id, COUNT(DISTINCT vod_id) AS c,
            GROUP_CONCAT(DISTINCT vod_id ORDER BY vod_id) AS ids
          FROM lcm_vod_play
          WHERE source_vod_id IS NOT NULL AND source_vod_id <> ''
          GROUP BY source_id, source_vod_id
          HAVING c > 1`,
    );
    const rows = rawRows as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    const allIds = rows.flatMap((row) => String(row.ids).split(',').map((id) => Number(id)));
    const [vodRows] = await db.execute(
      sql`SELECT id, name, year,
            (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = lcm_vod.id) AS play_count
          FROM lcm_vod WHERE id IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)})`,
    );
    const vodMap = new Map<number, { name: string; year: number; playCount: number }>();
    for (const row of vodRows as unknown as Array<Record<string, unknown>>) {
      vodMap.set(Number(row.id), {
        name: String(row.name),
        year: Number(row.year) || 0,
        playCount: Number(row.play_count) || 0,
      });
    }

    return rows.map((row) => {
      const vodIds = String(row.ids)
        .split(',')
        .map((id) => Number(id))
        .filter((id) => vodMap.has(id))
        .sort((a, b) => a - b);
      const first = vodMap.get(vodIds[0]!);
      return {
        key: `${Number(row.source_id)}-${String(row.source_vod_id)}`,
        name: first?.name ?? '',
        year: first?.year ?? 0,
        count: vodIds.length,
        playTotal: vodIds.reduce((sum, id) => sum + (vodMap.get(id)?.playCount ?? 0), 0),
        vodIds,
      };
    });
  };

  /** 分组键：32 位哈希，宽松键分组可能带 `#年份` 后缀 */
  const isHashKey = (key: string): boolean => /^[0-9a-f]{32}(#\d{1,4})?$/.test(key);
  const isSameKey = (key: string): boolean => /^\d+-[^\s-][^\s]*$/.test(key);

  /** 取一组重复影片，含线路来源，用于右侧对比 */
  const loadGroupDetail = async (
    kind: 'auto' | 'suspect' | 'same',
    key: string,
  ): Promise<MergeGroup | null> => {
    let ids: number[] = [];

    if (kind === 'same') {
      const [sourceId, sourceVodId] = key.split('-');
      const [rawRows] = await db.execute(
        sql`SELECT DISTINCT vod_id FROM lcm_vod_play
            WHERE source_id = ${Number(sourceId)} AND source_vod_id = ${String(sourceVodId)}`,
      );
      ids = (rawRows as unknown as Array<{ vod_id: number }>).map((row) => Number(row.vod_id));
    } else {
      const [hash, yearText] = key.split('#');
      const year = Number(yearText);
      const yearFilter = year > 0 ? sql` AND year = ${year}` : sql``;
      const [rawRows] = await db.execute(
        sql`SELECT id FROM lcm_vod WHERE ${sql.raw(kind === 'auto' ? 'name_hash' : 'name_hash_loose')} = ${String(hash)}${yearFilter}`,
      );
      ids = (rawRows as unknown as Array<{ id: number }>).map((row) => Number(row.id));
      // 可合并组也可能来自宽松键（演员判定升级的那批），严格键查不到时退回宽松键
      if (kind === 'auto' && ids.length < 2) {
        const [looseRows] = await db.execute(
          sql`SELECT id FROM lcm_vod WHERE name_hash_loose = ${String(hash)}${yearFilter}`,
        );
        ids = (looseRows as unknown as Array<{ id: number }>).map((row) => Number(row.id));
      }
    }

    const members = await loadMembersByIds(ids);
    if (members.length < 2) return null;

    return {
      key,
      kind,
      name: members[0]?.name ?? '',
      year: members.find((item) => item.year > 0)?.year ?? 0,
      members,
      playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
    };
  };

  /**
   * 可合并 / 疑似 / 冲突 三类分组。
   * 可合并 = 严格键相同且年份相容，或者宽松键相同 + 年份相容 + 演员高度重合。
   */
  const loadMergeCandidates = async (): Promise<{
    auto: MergeGroup[];
    conflict: MergeGroup[];
    suspects: MergeGroup[];
    ignored: Set<string>;
  }> => {
    const [strictGroups, looseGroups, ignored] = await Promise.all([
      loadGroups('name_hash', 'auto'),
      loadGroups('name_hash_loose', 'suspect'),
      loadIgnored(),
    ]);

    const strictAuto = strictGroups
      .filter((group) => yearCompatible(group.members))
      .filter((group) => !ignored.has(ignoreKey('auto', group.key)))
      .map((group) => ({ ...group, matchedBy: 'strict' as const }));

    // 疑似：去掉标点后同名，但严格键不止一种（标点差异，不是空格差异）
    const looseSuspects = looseGroups
      .flatMap(splitByYear)
      .filter((group) => group.members.length > 1)
      .filter((group) => new Set(group.members.map((item) => item.strictKey)).size > 1)
      .filter((group) => !ignored.has(ignoreKey('suspect', group.key)));

    const upgraded = looseSuspects
      .filter((group) => !ignored.has(ignoreKey('auto', group.key)))
      .filter((group) => actorMatched(group))
      .map((group) => ({
        ...group,
        matchedBy: 'actor' as const,
        actorOverlap: actorOverlap(group.members),
      }));
    const upgradedKeys = new Set(upgraded.map((group) => group.key));

    return {
      auto: [...strictAuto, ...upgraded],
      conflict: strictGroups.filter((group) => !yearCompatible(group.members)),
      suspects: looseSuspects.filter((group) => !upgradedKeys.has(group.key)),
      ignored,
    };
  };

  /** 预览：分组的轻量列表（不含线路明细） */
  app.get('/merge-vods/preview', async (_req, reply) => {
    const [candidates, sameSource] = await Promise.all([loadMergeCandidates(), loadSameSourceGroups()]);
    const { auto, conflict, suspects, ignored } = candidates;

    const light = (group: MergeGroup) => ({
      key: group.key,
      kind: group.kind,
      name: group.name,
      year: group.year,
      count: group.members.length,
      playTotal: group.playTotal,
      matchedBy: group.matchedBy,
      actorOverlap: group.actorOverlap,
    });

    const same = sameSource.filter((group) => !ignored.has(ignoreKey('same', group.key)));

    return ok(reply, {
      auto: auto.map(light),
      suspects: suspects.map(light),
      same: same.map((group) => ({
        key: group.key,
        kind: 'same' as const,
        name: group.name,
        year: group.year,
        count: group.count,
        playTotal: group.playTotal,
      })),
      summary: {
        autoGroups: auto.length,
        autoVods: auto.reduce((sum, group) => sum + group.members.length - 1, 0),
        suspectGroups: suspects.length,
        sameGroups: same.length,
        conflictGroups: conflict.length,
        ignored: ignored.size,
      },
    });
  });

  /** 单组详情：成员与线路来源 */
  app.get('/merge-vods/group', async (req, reply) => {
    const query = req.query as { key?: string; kind?: string };
    const key = (query.key ?? '').trim();
    const kind = query.kind === 'same' ? 'same' : query.kind === 'suspect' ? 'suspect' : 'auto';
    const valid = kind === 'same' ? isSameKey(key) : isHashKey(key);
    if (!valid) return fail(reply, 400, ErrorCode.BAD_REQUEST, '分组标识不正确');

    const group = await loadGroupDetail(kind, key);
    if (!group) return fail(reply, 404, ErrorCode.NOT_FOUND, '这组影片已经不存在了');
    return ok(reply, group);
  });

  /** 合并一组影片，可指定保留哪一条 */
  app.post('/merge-vods', async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: number[]; keep_id?: number };
    const ids = (Array.isArray(body.ids) ? body.ids : []).map((id) => Number(id)).filter((id) => id > 0);
    if (ids.length < 2) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请至少选择两条影片');

    const [rawRows] = await db.execute(
      sql`SELECT v.id, v.name, v.year, v.status,
            DATE_FORMAT(v.collected_at, '%Y-%m-%d %H:%i:%s') AS collected_at,
            (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS play_count
          FROM lcm_vod v WHERE v.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
    );
    const members: MergeMember[] = (rawRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      year: Number(row.year) || 0,
      status: Number(row.status) || 0,
      cover: '',
      playCount: Number(row.play_count) || 0,
      collectedAt: String(row.collected_at),
      strictKey: '',
      lines: [],
    }));

    const merged = await mergeGroup(members, Number(body.keep_id ?? 0) || undefined);
    return ok(reply, { merged });
  });

  /** 忽略 / 恢复一个重复分组 */
  app.post('/merge-vods/ignore', async (req, reply) => {
    const body = (req.body ?? {}) as { key?: string; kind?: string; ignored?: boolean };
    const key = (body.key ?? '').trim();
    const kind = body.kind === 'same' ? 'same' : body.kind === 'suspect' ? 'suspect' : 'auto';
    const valid = kind === 'same' ? isSameKey(key) : isHashKey(key);
    if (!valid) return fail(reply, 400, ErrorCode.BAD_REQUEST, '分组标识不正确');

    const mergeKey = ignoreKey(kind, key);
    if (body.ignored === false) {
      await db.execute(sql`DELETE FROM lcm_vod_merge_ignore WHERE merge_key = ${mergeKey}`);
    } else {
      await db.execute(
        sql`INSERT INTO lcm_vod_merge_ignore (merge_key, kind) VALUES (${mergeKey}, ${kind})
            ON DUPLICATE KEY UPDATE kind = ${kind}`,
      );
    }
    return ok(reply, { ignored: body.ignored !== false });
  });

  /** 一键合并全部可自动合并的分组 */
  app.post('/merge-vods/batch', async (req, reply) => {
    const body = (req.body ?? {}) as { confirm?: boolean };
    const { auto } = await loadMergeCandidates();

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

  /** 对勾选的若干分组批量合并或忽略 */
  app.post('/merge-vods/batch-keys', async (req, reply) => {
    const body = (req.body ?? {}) as {
      keys?: Array<{ key?: string; kind?: string }>;
      action?: string;
      confirm?: boolean;
    };
    const action = body.action === 'ignore' ? 'ignore' : 'merge';
    const keys = (Array.isArray(body.keys) ? body.keys : [])
      .map((item) => {
        const kind = item.kind === 'same' ? 'same' : item.kind === 'suspect' ? 'suspect' : 'auto';
        const key = String(item.key ?? '').trim();
        return { kind, key } as const;
      })
      .filter((item) => (item.kind === 'same' ? isSameKey(item.key) : isHashKey(item.key)));
    if (keys.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请先选择分组');

    const groups: MergeGroup[] = [];
    for (const { kind, key } of keys) {
      const group = await loadGroupDetail(kind, key);
      if (group) groups.push(group);
    }
    const mergeable = groups.filter((group) => yearCompatible(group.members));
    const skipped = groups.length - mergeable.length;

    if (!body.confirm) {
      return ok(reply, {
        needConfirm: true,
        action,
        groups: action === 'merge' ? mergeable.length : groups.length,
        vods: mergeable.reduce((sum, group) => sum + group.members.length - 1, 0),
        skipped,
      });
    }

    if (action === 'ignore') {
      for (const group of groups) {
        await db.execute(
          sql`INSERT INTO lcm_vod_merge_ignore (merge_key, kind) VALUES (${ignoreKey(group.kind, group.key)}, ${group.kind})
              ON DUPLICATE KEY UPDATE kind = ${group.kind}`,
        );
      }
      return ok(reply, { groups: groups.length, merged: 0, skipped: 0, ignored: groups.length });
    }

    let merged = 0;
    for (const group of mergeable) {
      merged += await mergeGroup(group.members);
    }
    return ok(reply, { groups: mergeable.length, merged, skipped, ignored: 0 });
  });
};
