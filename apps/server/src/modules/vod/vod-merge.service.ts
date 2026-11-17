import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { compareId, countEpisodes } from '@lcm/shared';
import { DataSource } from 'typeorm';
import { VodPlayEntity } from '../vod-play/vod-play.entity';
import type {
  VodMergeBatchDTO,
  VodMergeBatchKeysDTO,
  VodMergeGroupDTO,
  VodMergeIgnoreDTO,
  VodMergeKind,
  VodMergeMergeDTO,
} from './dto/vod-merge.dto';

export interface MergeLine {
  sourceId: string;
  sourceFrom: string;
  sourceName: string;
  episodes: number;
  updatedAt: string;
}

interface MergeLineRow {
  vodId?: string;
  sourceId: string | null;
  sourceFrom: string;
  playUrl: string;
  sourceVodId: string;
  sourceUpdatedAt: Date | string | null;
  collectedAt: Date | string;
}

/** 同一张表既当源又当目标，`VALUES()` 里的列名会模糊，所以来源与目标分两条语句取 */
const LINES_OF = `SELECT source_id AS sourceId, source_from AS sourceFrom, play_url AS playUrl,
    source_vod_id AS sourceVodId, source_updated_at AS sourceUpdatedAt, collected_at AS collectedAt
  FROM lcm_vod_play WHERE vod_id IN (?)`;
const LINES_OF_ONE_FOR_UPDATE = `SELECT source_id AS sourceId, source_from AS sourceFrom, play_url AS playUrl,
    source_vod_id AS sourceVodId, source_updated_at AS sourceUpdatedAt, collected_at AS collectedAt
  FROM lcm_vod_play WHERE vod_id = ? FOR UPDATE`;

/** 与唯一键 uk_vod_source_from 对齐：源站 id 为 NULL 时 MySQL 视为互不相同 */
function lineKeyOf(line: MergeLineRow): string {
  return `${line.sourceId ?? ''}|${line.sourceFrom}`;
}

export interface MergeMember {
  id: string;
  name: string;
  year: number;
  status: number;
  cover: string;
  playCount: number;
  episodeTotal: number;
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

export interface MergeGroup {
  key: string;
  kind: VodMergeKind;
  name: string;
  year: number;
  members: MergeMember[];
  playTotal: number;
  /** 判定依据：strict=严格键相同；actor=宽松键 + 年份 + 演员重合 */
  matchedBy?: 'strict' | 'actor';
  /** 演员重合率 0-1，仅 matchedBy=actor 时有意义 */
  actorOverlap?: number;
}

interface SameSourceGroup {
  key: string;
  name: string;
  year: number;
  count: number;
  playTotal: number;
  vodIds: string[];
}

/** 预览用的轻量分组：只带列表要展示的字段，不含成员行（12 万部影片的库里有 1 万组） */
export interface LightGroup {
  key: string;
  kind: VodMergeKind;
  name: string;
  year: number;
  count: number;
  playTotal: number;
  matchedBy?: 'strict' | 'actor';
  actorOverlap?: number;
}

/** 预览返回体 */
export interface MergePreview {
  auto: LightGroup[];
  suspects: LightGroup[];
  same: Array<Record<string, unknown>>;
  summary: {
    autoGroups: number;
    autoVods: number;
    suspectGroups: number;
    sameGroups: number;
    conflictGroups: number;
    ignored: number;
  };
}

/** 演员判定阈值：短名单里有 60% 出现在对方名单里 */
const ACTOR_MATCH_MIN = 0.6;

/** 被忽略的重复分组，键为「类型:哈希」 */
const ignoreKey = (kind: string, key: string): string => `${kind}:${key}`;

/** DATETIME → `YYYY-MM-DD HH:mm:ss`（进程时区） */
function formatStamp(value: Date | string | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.slice(0, 19).replace('T', ' ');
  if (Number.isNaN(value.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

/** 分组键：32 位哈希，宽松键分组可能带 `~年份` 后缀（不能用 #，会被浏览器当锚点截断） */
const isHashKey = (key: string): boolean => /^[0-9a-f]{32}(~\d{1,4})?$/.test(key);
const isSameKey = (key: string): boolean => /^\d+-[^\s-][^\s]*$/.test(key);

/** 年份相容：所有非 0 年份相同 */
function yearCompatible(members: MergeMember[]): boolean {
  const years = new Set(members.map((item) => item.year).filter((year) => year > 0));
  return years.size <= 1;
}

/**
 * 宽松键组按年份拆簇：同名但年份不同视为不同作品。
 * 年份为 0 的记录只在单一年份时跟着走，多簇时不参与（无法判定归属）。
 */
function splitByYear(group: MergeGroup): MergeGroup[] {
  const years = [...new Set(group.members.map((item) => item.year).filter((year) => year > 0))].sort(
    (a, b) => a - b,
  );
  if (years.length <= 1) return [group];
  return years.map((year) => {
    const members = group.members.filter((item) => item.year === year);
    return {
      ...group,
      key: `${group.key}~${year}`,
      name: members[0]?.name ?? group.name,
      year,
      members,
      playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
    };
  });
}

function actorSet(text?: string): Set<string> {
  const raw = String(text ?? '');
  // 带逗号时按逗号分，否则按空白分——避免把 "Poppy Ratchapong" 这类英文名拆碎
  const separator = /[,，、/]/.test(raw) ? /[,，、/]+/ : /\s+/;
  return new Set(
    raw
      .split(separator)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** 组内两两比较演员名单，取最小重合率；有一方为空则返回 0（不足以下结论） */
function actorOverlap(members: MergeMember[]): number {
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
}

/**
 * 重复影片合并工具（Prisma → TypeORM 移植版）。
 * 三组来源：严格键（同名同标点）、疑似（去标点后同名，可选演员判定升级）、同源同 id（铁证重复）。
 *
 * 数据访问全部走 `dataSource.query`：这里都是「按哈希列分组 + 窄列扫描 + 整组搬线路」的批量语句，
 * 用 Entity 反而会读出 cover/actor 这些长列。id 是 BIGINT，TS 侧一律字符串。
 */
@Injectable()
export class VodMergeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** 被忽略的分组键集合 */
  private async loadIgnored(): Promise<Set<string>> {
    const rows = await this.dataSource.query<Array<{ mergeKey: string }>>(
      'SELECT merge_key AS mergeKey FROM lcm_vod_merge_ignore',
    );
    return new Set(rows.map((row) => row.mergeKey));
  }

  /** 线路数 / 总集数聚合，避免逐行相关子查询 */
  private async loadPlayStats(ids: string[]): Promise<Map<string, { count: number; episodes: number }>> {
    const stats = new Map<string, { count: number; episodes: number }>();
    if (ids.length === 0) return stats;
    const rows = await this.dataSource.query<Array<{ vodId: string; playCount: string; epTotal: string }>>(
      `SELECT p.vod_id AS vodId,
          COUNT(*) AS playCount,
          COALESCE(SUM(CASE WHEN p.play_url = '' THEN 0
            ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END), 0) AS epTotal
        FROM lcm_vod_play p WHERE p.vod_id IN (?)
        GROUP BY p.vod_id`,
      [ids],
    );
    for (const row of rows) {
      stats.set(String(row.vodId), {
        count: Number(row.playCount) || 0,
        episodes: Number(row.epTotal) || 0,
      });
    }
    return stats;
  }

  /**
   * 严格键分组的轻量统计，只返回「年份相容」的组。
   *
   * 老库里同名不同年的组极多（1 万组里 1 万组年份都不相容），它们只会被算进
   * 「年份冲突」计数、不会出现在列表里，所以直接在 SQL 里用 HAVING 过滤掉，
   * 避免把 2 万条成员行搬到 Node 再筛掉。两条 SQL 并行，共约 1.2 秒。
   */
  private async loadStrictLight(): Promise<{ auto: LightGroup[]; conflictCount: number }> {
    const [rows, totals] = await Promise.all([
      this.dataSource.query<
        Array<{ k: string; c: string; name: string | null; y: number | null; plays: string }>
      >(
        `SELECT v.name_hash AS k, COUNT(DISTINCT v.id) AS c, MIN(v.name) AS name,
            MIN(NULLIF(v.year, 0)) AS y, COUNT(p.vod_id) AS plays
          FROM (SELECT name_hash AS h FROM lcm_vod WHERE name_hash <> ''
                  GROUP BY name_hash HAVING COUNT(*) > 1
                    AND MIN(NULLIF(year, 0)) <=> MAX(NULLIF(year, 0))) d
          JOIN lcm_vod v ON v.name_hash = d.h
          LEFT JOIN lcm_vod_play p ON p.vod_id = v.id
          GROUP BY d.h`,
      ),
      this.dataSource.query<Array<{ total: string }>>(
        `SELECT COUNT(*) AS total FROM (SELECT name_hash AS h FROM lcm_vod WHERE name_hash <> ''
            GROUP BY name_hash HAVING COUNT(*) > 1) x`,
      ),
    ]);

    const auto: LightGroup[] = rows.map((row) => ({
      key: row.k,
      kind: 'auto' as const,
      name: row.name ?? '',
      year: row.y === null ? 0 : Number(row.y),
      count: Number(row.c) || 0,
      playTotal: Number(row.plays) || 0,
    }));
    const total = Number(totals[0]?.total ?? 0) || 0;
    return { auto, conflictCount: Math.max(total - auto.length, 0) };
  }

  /**
   * 疑似重复分组：去标点后同名，但组内严格键不止一种。
   * 两步走——先用 idx_merge_loose 数出组内有几种严格键（通常一两百组），
   * 再只给这些组拉成员行与演员，避免把 2 万条成员全读出来。
   */
  private async loadSuspectGroups(): Promise<MergeGroup[]> {
    const keyRows = await this.dataSource.query<Array<{ k: string }>>(
      `SELECT v.name_hash_loose AS k, COUNT(DISTINCT v.name_hash) AS sc
        FROM lcm_vod v
        JOIN (SELECT name_hash_loose AS h FROM lcm_vod WHERE name_hash_loose <> ''
                GROUP BY name_hash_loose HAVING COUNT(*) > 1) d
          ON d.h = v.name_hash_loose
        GROUP BY v.name_hash_loose HAVING sc > 1`,
    );
    const keys = keyRows.map((row) => row.k);
    if (keys.length === 0) return [];

    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        year: number;
        status: number;
        strictKey: string;
        k: string;
        collectedAt: Date | string | null;
      }>
    >(
      `SELECT v.id, v.name, v.year, v.status, v.name_hash AS strictKey,
          v.name_hash_loose AS k, v.collected_at AS collectedAt
        FROM lcm_vod v WHERE v.name_hash_loose IN (?)`,
      [keys],
    );

    const ids = rows.map((row) => String(row.id));
    const [playStats, actorRows] = await Promise.all([
      this.loadPlayStats(ids),
      this.dataSource.query<Array<{ id: string; actor: string | null }>>(
        'SELECT id, actor FROM lcm_vod WHERE id IN (?)',
        [ids],
      ),
    ]);
    const actorById = new Map(actorRows.map((row) => [String(row.id), row.actor ?? '']));

    const byKey = new Map<string, MergeMember[]>();
    for (const row of rows) {
      const list = byKey.get(row.k) ?? [];
      list.push({
        id: String(row.id),
        name: row.name,
        year: Number(row.year) || 0,
        status: Number(row.status) || 0,
        cover: '',
        playCount: playStats.get(String(row.id))?.count ?? 0,
        episodeTotal: playStats.get(String(row.id))?.episodes ?? 0,
        collectedAt: formatStamp(row.collectedAt),
        strictKey: row.strictKey,
        lines: [],
        actor: actorById.get(String(row.id)) ?? '',
      });
      byKey.set(row.k, list);
    }

    const groups: MergeGroup[] = [];
    for (const [key, members] of byKey) {
      members.sort((a, b) => compareId(a.id, b.id));
      groups.push({
        key,
        kind: 'suspect',
        name: members[0]?.name ?? '',
        year: members.find((item) => item.year > 0)?.year ?? 0,
        members,
        playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
      });
    }
    return groups;
  }

  /** 宽松键组能否按「名称 + 年份 + 演员」升级为可合并 */
  private actorMatched(group: MergeGroup): boolean {
    return group.members.length > 1 && yearCompatible(group.members) && actorOverlap(group.members) >= ACTOR_MATCH_MIN;
  }

  /**
   * 分组的默认保留项：线路最多 → 总集数最多 → 采集时间最新 → id 最小。
   * 线路决定合并后还剩多少条线路；集数与采集时间决定留下的这条元信息是否最新。
   */
  private defaultKeep(members: MergeMember[]): MergeMember {
    return [...members].sort(
      (a, b) =>
        b.playCount - a.playCount ||
        b.episodeTotal - a.episodeTotal ||
        String(b.collectedAt).localeCompare(String(a.collectedAt)) ||
        compareId(a.id, b.id),
    )[0]!;
  }

  /** 合并一组：keepId 指定保留项，其余线路并过去后删掉 */
  private async mergeGroup(members: MergeMember[], keepId?: string): Promise<number> {
    const keep = members.find((item) => item.id === keepId) ?? this.defaultKeep(members);
    const others = members.filter((item) => item.id !== keep.id).map((item) => item.id);
    if (others.length === 0) return 0;

    const latest = members.map((item) => item.collectedAt).sort().at(-1) ?? '';

    await this.dataSource.transaction(async (manager) => {
      const lines = await manager.query<MergeLineRow[]>(LINES_OF, [others]);
      // FOR UPDATE：下面要在 JS 里比较「新线路更长才覆盖」，读到的现有行必须锁住
      const kept = await manager.query<MergeLineRow[]>(LINES_OF_ONE_FOR_UPDATE, [keep.id]);

      const existing = new Map(kept.map((line) => [lineKeyOf(line), line]));
      // 先把来源侧同一条线路的重复行收敛成集数最多的那条（唯一键是 vod+source+from）
      const chosen = new Map<string, MergeLineRow>();
      for (const line of lines) {
        const key = lineKeyOf(line);
        const prev = chosen.get(key);
        if (prev === undefined || countEpisodes(line.playUrl) > countEpisodes(prev.playUrl)) {
          chosen.set(key, line);
        }
      }

      const rows: MergeLineRow[] = [];
      for (const [key, line] of chosen) {
        const prev = existing.get(key);
        // 新集数少于旧集数视为源站数据残缺，保留原值
        if (prev !== undefined && countEpisodes(prev.playUrl) >= countEpisodes(line.playUrl)) continue;
        rows.push({ ...line, vodId: keep.id });
      }

      // 一条多行 INSERT：一批淘汰影片的线路常有几十条，逐条发就是几十次往返
      if (rows.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(VodPlayEntity)
          .values(
            rows.map((row) => ({
              vodId: keep.id,
              sourceId: row.sourceId,
              sourceFrom: row.sourceFrom,
              playUrl: row.playUrl,
              sourceVodId: row.sourceVodId,
              sourceUpdatedAt: row.sourceUpdatedAt,
              collectedAt: row.collectedAt,
              // ON DUPLICATE 里要更新 updated_at，插入列表里就必须有这一列
              updatedAt: new Date(),
            })),
          )
          // orUpdate 的列名会被原样拼进 `VALUES(...)`，这里必须写库里的列名而不是属性名
          .orUpdate(['source_vod_id', 'source_updated_at', 'play_url', 'collected_at', 'updated_at'])
          .execute();
      }

      await manager.query('DELETE FROM lcm_vod_play WHERE vod_id IN (?)', [others]);
      if (latest !== '') {
        // 原生 UPDATE 不会触发 @UpdateDateColumn，时间戳要自己补
        await manager.query(
          'UPDATE lcm_vod SET collected_at = GREATEST(collected_at, ?), updated_at = NOW() WHERE id = ?',
          [latest, keep.id],
        );
      }
      await manager.query('DELETE FROM lcm_vod WHERE id IN (?)', [others]);
    });

    return others.length;
  }

  /** 按 id 列表取成员（含线路来源） */
  private async loadMembersByIds(ids: string[]): Promise<MergeMember[]> {
    if (ids.length === 0) return [];
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        subName: string | null;
        year: number;
        status: number;
        cover: string | null;
        nameHash: string;
        area: string | null;
        lang: string | null;
        actor: string | null;
        episodeCount: number;
        categoryName: string | null;
        collectedAt: Date | string | null;
        playCount: string;
        epTotal: string;
      }>
    >(
      `SELECT v.id, v.name, v.sub_name AS subName, v.year, v.status, v.cover, v.name_hash AS nameHash,
          v.area, v.lang, v.actor, v.episode_count AS episodeCount, c.name AS categoryName,
          v.collected_at AS collectedAt,
          (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS playCount,
          (SELECT COALESCE(SUM(CASE WHEN p.play_url = '' THEN 0
              ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END), 0)
            FROM lcm_vod_play p WHERE p.vod_id = v.id) AS epTotal
        FROM lcm_vod v LEFT JOIN lcm_category c ON c.id = v.category_id
        WHERE v.id IN (?) ORDER BY v.id`,
      [ids],
    );
    if (rows.length === 0) return [];

    const lineRows = await this.dataSource.query<
      Array<{
        vodId: string;
        sourceId: string | null;
        sourceFrom: string;
        sourceName: string | null;
        sourceUpdatedAt: Date | string | null;
        episodes: string;
      }>
    >(
      `SELECT p.vod_id AS vodId, p.source_id AS sourceId, p.source_from AS sourceFrom,
          s.name AS sourceName, p.source_updated_at AS sourceUpdatedAt,
          CASE WHEN p.play_url = '' THEN 0
            ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END AS episodes
        FROM lcm_vod_play p LEFT JOIN lcm_collect_source s ON s.id = p.source_id
        WHERE p.vod_id IN (?)
        ORDER BY p.source_id, p.id`,
      [ids],
    );

    const linesByVod = new Map<string, MergeLine[]>();
    for (const row of lineRows) {
      const vodId = String(row.vodId);
      const list = linesByVod.get(vodId) ?? [];
      list.push({
        sourceId: row.sourceId === null ? '' : String(row.sourceId),
        sourceFrom: row.sourceFrom,
        sourceName: row.sourceName ?? '手工添加',
        episodes: Number(row.episodes) || 0,
        updatedAt:
          row.sourceUpdatedAt === null || row.sourceUpdatedAt === undefined
            ? ''
            : new Date(row.sourceUpdatedAt).toISOString().slice(0, 10),
      });
      linesByVod.set(vodId, list);
    }

    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      year: Number(row.year) || 0,
      status: Number(row.status) || 0,
      cover: row.cover ?? '',
      playCount: Number(row.playCount) || 0,
      episodeTotal: Number(row.epTotal) || 0,
      collectedAt: formatStamp(row.collectedAt),
      strictKey: row.nameHash,
      lines: linesByVod.get(String(row.id)) ?? [],
      subName: row.subName ?? '',
      category: row.categoryName ?? '',
      area: row.area ?? '',
      lang: row.lang ?? '',
      actor: row.actor ?? '',
      episodeCount: Number(row.episodeCount) || 0,
    }));
  }

  /** 同源同 source_vod_id 却挂在多部影片上的分组：这是铁证重复 */
  private async loadSameSourceGroups(): Promise<SameSourceGroup[]> {
    const rows = await this.dataSource.query<
      Array<{ sourceId: string; sourceVodId: string; c: string; ids: string }>
    >(
      `SELECT source_id AS sourceId, source_vod_id AS sourceVodId, COUNT(DISTINCT vod_id) AS c,
          GROUP_CONCAT(DISTINCT vod_id ORDER BY vod_id) AS ids
        FROM lcm_vod_play
        WHERE source_vod_id IS NOT NULL AND source_vod_id <> ''
        GROUP BY source_id, source_vod_id
        HAVING c > 1`,
    );
    if (rows.length === 0) return [];

    const allIds = rows.flatMap((row) => String(row.ids).split(','));
    const vodRows = await this.dataSource.query<Array<{ id: string; name: string; year: number; playCount: string }>>(
      `SELECT id, name, year,
          (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = lcm_vod.id) AS playCount
        FROM lcm_vod WHERE id IN (?)`,
      [allIds],
    );
    const vodMap = new Map<string, { name: string; year: number; playCount: number }>();
    for (const row of vodRows) {
      vodMap.set(String(row.id), {
        name: row.name,
        year: Number(row.year) || 0,
        playCount: Number(row.playCount) || 0,
      });
    }

    return rows.map((row) => {
      const vodIds = String(row.ids)
        .split(',')
        .filter((id) => vodMap.has(id))
        .sort(compareId);
      const first = vodIds.length > 0 ? vodMap.get(vodIds[0]!) : undefined;
      return {
        key: `${String(row.sourceId)}-${row.sourceVodId}`,
        name: first?.name ?? '',
        year: first?.year ?? 0,
        count: vodIds.length,
        playTotal: vodIds.reduce((sum, id) => sum + (vodMap.get(id)?.playCount ?? 0), 0),
        vodIds,
      };
    });
  }

  /** 取一组重复影片的详情 */
  private async loadGroupDetail(kind: VodMergeKind, key: string): Promise<MergeGroup | null> {
    let ids: string[] = [];
    if (kind === 'same') {
      // 源站影片 id 本身可能带减号，只按第一个减号切
      const splitAt = key.indexOf('-');
      const sourceId = key.slice(0, splitAt);
      const sourceVodId = key.slice(splitAt + 1);
      const rows = await this.dataSource.query<Array<{ vodId: string }>>(
        `SELECT DISTINCT vod_id AS vodId FROM lcm_vod_play
          WHERE source_id = ? AND source_vod_id = ?`,
        [sourceId, sourceVodId],
      );
      ids = rows.map((row) => String(row.vodId));
    } else {
      const [hash = '', yearText] = key.split('~');
      const year = Number(yearText);
      const column = kind === 'auto' ? 'name_hash' : 'name_hash_loose';
      const yearFilter = year > 0 ? ' AND year = ?' : '';
      const params: Array<string | number> = [hash];
      if (year > 0) params.push(year);
      const rows = await this.dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM lcm_vod WHERE ${column} = ?${yearFilter}`,
        params,
      );
      ids = rows.map((row) => String(row.id));
      // 可合并组也可能来自宽松键（演员判定升级的那批），严格键查不到时退回宽松键；
      // 同键情况下严格组往往是宽松组的子集（只差标点），成员更多且演员过关时用宽松组
      if (kind === 'auto') {
        const looseRows = await this.dataSource.query<Array<{ id: string }>>(
          `SELECT id FROM lcm_vod WHERE name_hash_loose = ?${yearFilter}`,
          params,
        );
        const looseIds = looseRows.map((row) => String(row.id));
        if (looseIds.length > ids.length) {
          const looseMembers = await this.loadMembersByIds(looseIds);
          if (
            looseMembers.length > ids.length &&
            yearCompatible(looseMembers) &&
            actorOverlap(looseMembers) >= ACTOR_MATCH_MIN
          ) {
            ids = looseIds;
          }
        }
      }
    }

    const members = await this.loadMembersByIds(ids);
    if (members.length < 2) return null;

    return {
      key,
      kind,
      name: members[0]?.name ?? '',
      year: members.find((item) => item.year > 0)?.year ?? 0,
      members,
      playTotal: members.reduce((sum, item) => sum + item.playCount, 0),
    };
  }

  /** 预览：分组的轻量列表（不含线路明细） */
  async preview(): Promise<MergePreview> {
    // 三条统计互相独立，并行跑；最慢的严格键分组约 2 秒
    const [strict, looseGroups, sameSource, ignored] = await Promise.all([
      this.loadStrictLight(),
      this.loadSuspectGroups(),
      this.loadSameSourceGroups(),
      this.loadIgnored(),
    ]);

    const strictAuto: LightGroup[] = strict.auto
      .filter((group) => !ignored.has(ignoreKey('auto', group.key)))
      .map((group) => ({ ...group, matchedBy: 'strict' as const }));

    // 疑似：去掉标点后同名，但严格键不止一种（标点差异，不是空格差异）
    const looseSuspects = looseGroups
      .flatMap(splitByYear)
      .filter((group) => group.members.length > 1)
      .filter((group) => new Set(group.members.map((item) => item.strictKey)).size > 1)
      .filter((group) => !ignored.has(ignoreKey('suspect', group.key)));

    // 宽松键 + 年份相容 + 演员高度重合 → 升级为可合并
    const upgraded: LightGroup[] = looseSuspects
      .filter((group) => !ignored.has(ignoreKey('auto', group.key)))
      .filter((group) => this.actorMatched(group))
      .map((group) => ({
        key: group.key,
        kind: 'auto' as const,
        name: group.name,
        year: group.year,
        count: group.members.length,
        playTotal: group.playTotal,
        matchedBy: 'actor' as const,
        actorOverlap: actorOverlap(group.members),
      }));
    const upgradedKeys = new Set(upgraded.map((group) => group.key));

    // 严格键与宽松键在「名称里只有标点差异」时会算出同一个哈希：
    // 两个分组同键但成员数不同，保留成员多的那个（演员升级后的那组是超集），
    // 否则前端按 key 取到的是只含 2 条的严格组，合并会漏人。
    const autoByKey = new Map<string, LightGroup>();
    for (const group of [...strictAuto, ...upgraded]) {
      const prev = autoByKey.get(group.key);
      if (prev === undefined || group.count > prev.count) autoByKey.set(group.key, group);
    }
    const auto = [...autoByKey.values()];

    const suspects: LightGroup[] = looseSuspects
      .filter((group) => !upgradedKeys.has(group.key))
      .map((group) => ({
        key: group.key,
        kind: 'suspect' as const,
        name: group.name,
        year: group.year,
        count: group.members.length,
        playTotal: group.playTotal,
      }));

    const same = sameSource.filter((group) => !ignored.has(ignoreKey('same', group.key)));

    const value = {
      auto,
      suspects,
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
        autoVods: auto.reduce((sum, group) => sum + group.count - 1, 0),
        suspectGroups: suspects.length,
        sameGroups: same.length,
        conflictGroups: strict.conflictCount,
        ignored: ignored.size,
      },
    };
    return value;
  }

  /** 单组详情：成员与线路来源 */
  async group(dto: VodMergeGroupDTO): Promise<MergeGroup> {
    const kind = dto.kind ?? 'auto';
    const valid = kind === 'same' ? isSameKey(dto.key) : isHashKey(dto.key);
    if (!valid) throw new BadRequestException('分组标识不正确');
    const group = await this.loadGroupDetail(kind, dto.key);
    if (group === null) throw new NotFoundException('这组影片已经不存在了');
    return group;
  }

  /** 合并一组影片，可指定保留哪一条 */
  async merge(dto: VodMergeMergeDTO): Promise<{ merged: number }> {
    const ids = [...new Set(dto.ids)].filter((id) => BigInt(id) > 0n);
    if (ids.length < 2) throw new BadRequestException('请至少选择两条影片');

    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        year: number;
        status: number;
        collectedAt: Date | string | null;
        playCount: string;
        epTotal: string;
      }>
    >(
      `SELECT v.id, v.name, v.year, v.status, v.collected_at AS collectedAt,
          (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS playCount,
          (SELECT COALESCE(SUM(CASE WHEN p.play_url = '' THEN 0
              ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END), 0)
            FROM lcm_vod_play p WHERE p.vod_id = v.id) AS epTotal
        FROM lcm_vod v WHERE v.id IN (?)`,
      [ids],
    );

    const members: MergeMember[] = rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      year: Number(row.year) || 0,
      status: Number(row.status) || 0,
      cover: '',
      playCount: Number(row.playCount) || 0,
      episodeTotal: Number(row.epTotal) || 0,
      collectedAt: formatStamp(row.collectedAt),
      strictKey: '',
      lines: [],
    }));

    const merged = await this.mergeGroup(members, dto.keepId);
    return { merged };
  }

  /** 忽略 / 恢复一个重复分组（写 lcm_vod_merge_ignore，同键幂等） */
  private async setIgnored(mergeKey: string, kind: number, ignored: boolean): Promise<{ ignored: boolean }> {
    if (!ignored) {
      await this.dataSource.query('DELETE FROM lcm_vod_merge_ignore WHERE merge_key = ?', [mergeKey]);
      return { ignored: false };
    }
    await this.dataSource.query(
      `INSERT INTO lcm_vod_merge_ignore (merge_key, kind, created_at, updated_at)
        VALUES (?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE kind = ?, updated_at = NOW()`,
      [mergeKey, kind, kind],
    );
    return { ignored: true };
  }

  /** 忽略 / 恢复一个重复分组 */
  async ignore(dto: VodMergeIgnoreDTO): Promise<{ ignored: boolean }> {
    const kind = dto.kind ?? 'auto';
    const valid = kind === 'same' ? isSameKey(dto.key) : isHashKey(dto.key);
    if (!valid) throw new BadRequestException('分组标识不正确');
    const ignoreKind = kind === 'same' ? 2 : kind === 'suspect' ? 2 : 1;
    return this.setIgnored(ignoreKey(kind, dto.key), ignoreKind, dto.ignored ?? true);
  }

  /** 一键合并全部可自动合并的分组 */
  async batch(dto: VodMergeBatchDTO): Promise<{ needConfirm: boolean; groups: number; vods: number; merged: number }> {
    // 走预览的轻量结果，不再为「点一下按钮」把 2 万条成员行拉出来；
    // 真正合并时按组取详情（可合并的组通常只有个位数）
    const { auto } = await this.preview();
    const vods = auto.reduce((sum, group) => sum + group.count - 1, 0);
    if (dto.confirm !== true) {
      return { needConfirm: true, groups: auto.length, vods, merged: 0 };
    }
    let merged = 0;
    for (const group of auto) {
      const detail = await this.loadGroupDetail('auto', group.key);
      if (detail !== null) merged += await this.mergeGroup(detail.members);
    }
    return { needConfirm: false, groups: auto.length, vods, merged };
  }

  /** 对勾选的若干分组批量合并或忽略 */
  async batchKeys(dto: VodMergeBatchKeysDTO): Promise<{
    needConfirm: boolean;
    action: 'merge' | 'ignore';
    groups: number;
    vods: number;
    merged: number;
    skipped: number;
    ignored: number;
  }> {
    const action = dto.action ?? 'merge';
    const valid = dto.keys.filter((item) => ((item.kind ?? 'auto') === 'same' ? isSameKey(item.key) : isHashKey(item.key)));
    if (valid.length === 0) throw new BadRequestException('请先选择分组');

    const groups: MergeGroup[] = [];
    for (const item of valid) {
      const group = await this.loadGroupDetail(item.kind ?? 'auto', item.key);
      if (group !== null) groups.push(group);
    }
    const mergeable = groups.filter((group) => yearCompatible(group.members));
    const skipped = groups.length - mergeable.length;
    const vods = mergeable.reduce((sum, group) => sum + group.members.length - 1, 0);

    if (dto.confirm !== true) {
      return {
        needConfirm: true,
        action,
        groups: action === 'merge' ? mergeable.length : groups.length,
        vods,
        merged: 0,
        skipped,
        ignored: 0,
      };
    }

    if (action === 'ignore') {
      for (const group of groups) {
        await this.setIgnored(ignoreKey(group.kind, group.key), group.kind === 'auto' ? 1 : 2, true);
      }
      return {
        needConfirm: false,
        action: 'ignore',
        groups: groups.length,
        vods: 0,
        merged: 0,
        skipped: 0,
        ignored: groups.length,
      };
    }

    // 每组一个独立事务、成员互不重叠，所以可以并发；串行时 50 组要等 50 个事务。
    const CONCURRENCY = 4;
    let merged = 0;
    for (let start = 0; start < mergeable.length; start += CONCURRENCY) {
      const batch = mergeable.slice(start, start + CONCURRENCY);
      const counts = await Promise.all(batch.map((group) => this.mergeGroup(group.members)));
      merged += counts.reduce((sum, count) => sum + count, 0);
    }
    return { needConfirm: false, action: 'merge', groups: mergeable.length, vods, merged, skipped, ignored: 0 };
  }

  /** 批量查这些分组里哪些已被忽略（供前端打标） */
  async batchIgnored(keys: string[]): Promise<{ ignored: string[] }> {
    if (keys.length === 0) return { ignored: [] };
    const rows = await this.dataSource.query<Array<{ mergeKey: string }>>(
      'SELECT merge_key AS mergeKey FROM lcm_vod_merge_ignore WHERE merge_key IN (?)',
      [keys],
    );
    return { ignored: rows.map((row) => row.mergeKey) };
  }
}
