import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VodMergeIgnoreService } from '../vod-merge-ignore/vod-merge-ignore.service';
import type {
  VodMergeBatchDTO,
  VodMergeBatchKeysDTO,
  VodMergeGroupDTO,
  VodMergeIgnoreDTO,
  VodMergeMergeDTO,
} from './dto/vod-merge';

export interface MergeLine {
  sourceId: number;
  sourceFrom: string;
  sourceName: string;
  episodes: number;
  updatedAt: string;
}

export interface MergeMember {
  id: number;
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

interface SameSourceGroup {
  key: string;
  name: string;
  year: number;
  count: number;
  playTotal: number;
  vodIds: number[];
}

type Column = 'name_hash' | 'name_hash_loose';

/** 演员判定阈值：短名单里有 60% 出现在对方名单里 */
const ACTOR_MATCH_MIN = 0.6;

/** 被忽略的重复分组，键为「类型:哈希」 */
const ignoreKey = (kind: string, key: string): string => `${kind}:${key}`;

/** DATETIME → `YYYY-MM-DD HH:mm:ss`（进程时区） */
function formatStamp(value: Date | string | null): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 19).replace('T', ' ');
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
  const years = [...new Set(group.members.map((item) => item.year).filter((year) => year > 0))].sort((a, b) => a - b);
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

/** 线路数 / 总集数聚合，避免逐行相关子查询 */
function playStatsSql(ids: number[]): Prisma.Sql {
  return Prisma.sql`
    SELECT p.vod_id AS vodId,
      COUNT(*) AS playCount,
      COALESCE(SUM(CASE WHEN p.play_url = '' THEN 0
        ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END), 0) AS epTotal
    FROM lcm_vod_play p WHERE p.vod_id IN (${Prisma.join(ids)})
    GROUP BY p.vod_id`;
}

/**
 * 重复影片合并工具。
 * 三组来源：严格键（同名同标点）、疑似（去标点后同名，可选演员判定升级）、同源同 id（铁证重复）。
 */
@Injectable()
export class VodMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ignores: VodMergeIgnoreService,
  ) {}

  /** 被忽略的分组键集合 */
  private async loadIgnored(): Promise<Set<string>> {
    const rows = await this.ignores.all({});
    return new Set(rows.map((row) => row.mergeKey));
  }

  /** 按指定哈希列取重复分组 */
  private async loadGroups(column: Column, kind: 'auto' | 'suspect'): Promise<MergeGroup[]> {
    const hashRows = await this.prisma.$queryRaw<Array<{ k: string }>>(
      Prisma.sql`SELECT ${Prisma.raw(column)} AS k FROM lcm_vod WHERE ${Prisma.raw(column)} <> ''
        GROUP BY ${Prisma.raw(column)} HAVING COUNT(*) > 1`,
    );
    const keys = hashRows.map((row) => row.k);
    if (keys.length === 0) return [];

    // 只取窄列：cover / actor 是长 varchar，随行读会触发溢出页随机读；actor 只在需要演员判定时取
    const rows = await this.prisma.$queryRaw<
      Array<{ id: number; name: string; year: number; status: number; k: string; nameHash: string; collectedAt: Date | null }>
    >(
      Prisma.sql`SELECT v.id, v.name, v.year, v.status, v.${Prisma.raw(column)} AS k,
          v.name_hash AS nameHash, v.collected_at AS collectedAt
        FROM lcm_vod v WHERE v.${Prisma.raw(column)} IN (${Prisma.join(keys)})`,
    );

    const ids = rows.map((row) => Number(row.id));
    const playStats = new Map<number, { count: number; episodes: number }>();
    if (ids.length > 0) {
      for (const row of await this.prisma.$queryRaw<Array<{ vodId: number; playCount: bigint | number; epTotal: bigint | number }>>(
        playStatsSql(ids),
      )) {
        playStats.set(Number(row.vodId), { count: Number(row.playCount) || 0, episodes: Number(row.epTotal) || 0 });
      }
    }

    const byKey = new Map<string, MergeMember[]>();
    for (const row of rows) {
      const list = byKey.get(row.k) ?? [];
      list.push({
        id: Number(row.id),
        name: row.name,
        year: Number(row.year) || 0,
        status: Number(row.status) || 0,
        cover: '',
        playCount: playStats.get(Number(row.id))?.count ?? 0,
        episodeTotal: playStats.get(Number(row.id))?.episodes ?? 0,
        collectedAt: formatStamp(row.collectedAt),
        strictKey: row.nameHash,
        lines: [],
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
        a.id - b.id,
    )[0]!;
  }

  /** 合并一组：keepId 指定保留项，其余线路并过去后删掉 */
  private async mergeGroup(members: MergeMember[], keepId?: number): Promise<number> {
    const keep = members.find((item) => item.id === keepId) ?? this.defaultKeep(members);
    const others = members.filter((item) => item.id !== keep.id).map((item) => item.id);
    if (others.length === 0) return 0;

    const latest = members.map((item) => item.collectedAt).sort().at(-1) ?? '';

    await this.prisma.$transaction(async (tx) => {
      // 逐条搬线路：同一张表既当源又当目标时，ON DUPLICATE 里的列名会报 ambiguous
      const lines = await tx.vodPlay.findMany({
        where: { vodId: { in: others } },
        select: {
          sourceId: true,
          sourceFrom: true,
          playUrl: true,
          sourceVodId: true,
          sourceUpdatedAt: true,
          collectedAt: true,
        },
      });
      for (const line of lines) {
        await tx.$executeRaw`INSERT INTO lcm_vod_play
            (vod_id, source_id, source_from, play_url, source_vod_id, source_updated_at, collected_at)
          VALUES (${keep.id}, ${line.sourceId}, ${line.sourceFrom}, ${line.playUrl}, ${line.sourceVodId},
            ${line.sourceUpdatedAt}, ${line.collectedAt})
          ON DUPLICATE KEY UPDATE
            source_vod_id = IF(CHAR_LENGTH(VALUES(play_url)) > CHAR_LENGTH(play_url), VALUES(source_vod_id), source_vod_id),
            play_url = IF(CHAR_LENGTH(VALUES(play_url)) > CHAR_LENGTH(play_url), VALUES(play_url), play_url)`;
      }
      await tx.vodPlay.deleteMany({ where: { vodId: { in: others } } });
      if (latest) {
        await tx.$executeRaw`UPDATE lcm_vod SET collected_at = GREATEST(collected_at, ${latest}) WHERE id = ${keep.id}`;
      }
      await tx.vod.deleteMany({ where: { id: { in: others } } });
    });

    return others.length;
  }

  /** 按 id 列表取成员（含线路来源） */
  private async loadMembersByIds(ids: number[]): Promise<MergeMember[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: number;
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
        collectedAt: Date | null;
        playCount: bigint | number;
        epTotal: bigint | number;
      }>
    >(Prisma.sql`SELECT v.id, v.name, v.sub_name AS subName, v.year, v.status, v.cover, v.name_hash AS nameHash,
          v.area, v.lang, v.actor, v.episode_count AS episodeCount, c.name AS categoryName,
          v.collected_at AS collectedAt,
          (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS playCount,
          (SELECT COALESCE(SUM(CASE WHEN p.play_url = '' THEN 0
              ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END), 0)
            FROM lcm_vod_play p WHERE p.vod_id = v.id) AS epTotal
        FROM lcm_vod v LEFT JOIN lcm_category c ON c.id = v.category_id
        WHERE v.id IN (${Prisma.join(ids)}) ORDER BY v.id`);
    if (rows.length === 0) return [];

    const lineRows = await this.prisma.$queryRaw<
      Array<{
        vodId: number;
        sourceId: number | null;
        sourceFrom: string;
        sourceName: string | null;
        sourceUpdatedAt: Date | null;
        episodes: bigint | number;
      }>
    >(Prisma.sql`SELECT p.vod_id AS vodId, p.source_id AS sourceId, p.source_from AS sourceFrom,
          s.name AS sourceName, p.source_updated_at AS sourceUpdatedAt,
          CASE WHEN p.play_url = '' THEN 0
            ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END AS episodes
        FROM lcm_vod_play p LEFT JOIN lcm_collect_source s ON s.id = p.source_id
        WHERE p.vod_id IN (${Prisma.join(ids)})
        ORDER BY p.source_id, p.id`);

    const linesByVod = new Map<number, MergeLine[]>();
    for (const row of lineRows) {
      const vodId = Number(row.vodId);
      const list = linesByVod.get(vodId) ?? [];
      list.push({
        sourceId: Number(row.sourceId ?? 0),
        sourceFrom: row.sourceFrom,
        sourceName: row.sourceName ?? '手工添加',
        episodes: Number(row.episodes) || 0,
        updatedAt: row.sourceUpdatedAt ? row.sourceUpdatedAt.toISOString().slice(0, 10) : '',
      });
      linesByVod.set(vodId, list);
    }

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      year: Number(row.year) || 0,
      status: Number(row.status) || 0,
      cover: row.cover ?? '',
      playCount: Number(row.playCount) || 0,
      episodeTotal: Number(row.epTotal) || 0,
      collectedAt: formatStamp(row.collectedAt),
      strictKey: row.nameHash,
      lines: linesByVod.get(Number(row.id)) ?? [],
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
    const rows = await this.prisma.$queryRaw<
      Array<{ sourceId: number; sourceVodId: string; c: bigint | number; ids: string }>
    >(Prisma.sql`SELECT source_id AS sourceId, source_vod_id AS sourceVodId, COUNT(DISTINCT vod_id) AS c,
          GROUP_CONCAT(DISTINCT vod_id ORDER BY vod_id) AS ids
        FROM lcm_vod_play
        WHERE source_vod_id IS NOT NULL AND source_vod_id <> ''
        GROUP BY source_id, source_vod_id
        HAVING c > 1`);
    if (rows.length === 0) return [];

    const allIds = rows.flatMap((row) => String(row.ids).split(',').map((id) => Number(id)));
    const vodRows = await this.prisma.$queryRaw<Array<{ id: number; name: string; year: number; playCount: bigint | number }>>(
      Prisma.sql`SELECT id, name, year,
          (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = lcm_vod.id) AS playCount
        FROM lcm_vod WHERE id IN (${Prisma.join(allIds)})`,
    );
    const vodMap = new Map<number, { name: string; year: number; playCount: number }>();
    for (const row of vodRows) {
      vodMap.set(Number(row.id), {
        name: row.name,
        year: Number(row.year) || 0,
        playCount: Number(row.playCount) || 0,
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
        key: `${Number(row.sourceId)}-${row.sourceVodId}`,
        name: first?.name ?? '',
        year: first?.year ?? 0,
        count: vodIds.length,
        playTotal: vodIds.reduce((sum, id) => sum + (vodMap.get(id)?.playCount ?? 0), 0),
        vodIds,
      };
    });
  }

  /** 取一组重复影片的详情 */
  private async loadGroupDetail(kind: 'auto' | 'suspect' | 'same', key: string): Promise<MergeGroup | null> {
    let ids: number[] = [];
    if (kind === 'same') {
      // 源站影片 id 本身可能带减号，只按第一个减号切
      const splitAt = key.indexOf('-');
      const sourceId = key.slice(0, splitAt);
      const sourceVodId = key.slice(splitAt + 1);
      const rows = await this.prisma.$queryRaw<Array<{ vodId: number }>>(
        Prisma.sql`SELECT DISTINCT vod_id AS vodId FROM lcm_vod_play
          WHERE source_id = ${Number(sourceId)} AND source_vod_id = ${String(sourceVodId)}`,
      );
      ids = rows.map((row) => Number(row.vodId));
    } else {
      const [hash, yearText] = key.split('~');
      const year = Number(yearText);
      const column = kind === 'auto' ? 'name_hash' : 'name_hash_loose';
      const yearFilter = year > 0 ? Prisma.sql` AND year = ${year}` : Prisma.empty;
      const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM lcm_vod WHERE ${Prisma.raw(column)} = ${String(hash)}${yearFilter}`,
      );
      ids = rows.map((row) => Number(row.id));
      // 可合并组也可能来自宽松键（演员判定升级的那批），严格键查不到时退回宽松键
      if (kind === 'auto' && ids.length < 2) {
        const looseRows = await this.prisma.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM lcm_vod WHERE name_hash_loose = ${String(hash)}${yearFilter}`,
        );
        ids = looseRows.map((row) => Number(row.id));
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

  /**
   * 可合并 / 疑似 / 冲突 三类分组。
   * 可合并 = 严格键相同且年份相容，或者宽松键相同 + 年份相容 + 演员高度重合。
   */
  private async loadMergeCandidates(): Promise<{
    auto: MergeGroup[];
    conflict: MergeGroup[];
    suspects: MergeGroup[];
    ignored: Set<string>;
  }> {
    const [strictGroups, looseGroups, ignored] = await Promise.all([
      this.loadGroups('name_hash', 'auto'),
      this.loadGroups('name_hash_loose', 'suspect'),
      this.loadIgnored(),
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

    // actor 字段很长，只给「可能升级」的分组补（通常一两百组）
    const actorTargets = looseSuspects
      .filter((group) => !ignored.has(ignoreKey('auto', group.key)))
      .filter((group) => yearCompatible(group.members));
    const needActorIds = actorTargets
      .flatMap((group) => group.members.map((item) => item.id))
      .filter((id, index, list) => list.indexOf(id) === index);
    if (needActorIds.length > 0) {
      const actorRows = await this.prisma.$queryRaw<Array<{ id: number; actor: string | null }>>(
        Prisma.sql`SELECT id, actor FROM lcm_vod WHERE id IN (${Prisma.join(needActorIds)})`,
      );
      const actorById = new Map<number, string>();
      for (const row of actorRows) actorById.set(Number(row.id), row.actor ?? '');
      for (const group of actorTargets) {
        for (const member of group.members) member.actor = actorById.get(member.id) ?? '';
      }
    }

    const upgraded = looseSuspects
      .filter((group) => !ignored.has(ignoreKey('auto', group.key)))
      .filter((group) => this.actorMatched(group))
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
  }

  /** 预览：分组的轻量列表（不含线路明细） */
  async preview() {
    const [candidates, sameSource] = await Promise.all([this.loadMergeCandidates(), this.loadSameSourceGroups()]);
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

    return {
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
    };
  }

  /** 单组详情：成员与线路来源 */
  async group(dto: VodMergeGroupDTO): Promise<MergeGroup> {
    const valid = dto.kind === 'same' ? isSameKey(dto.key) : isHashKey(dto.key);
    if (!valid) throw new BadRequestException('分组标识不正确');
    const group = await this.loadGroupDetail(dto.kind, dto.key);
    if (!group) throw new NotFoundException('这组影片已经不存在了');
    return group;
  }

  /** 合并一组影片，可指定保留哪一条 */
  async merge(dto: VodMergeMergeDTO): Promise<{ merged: number }> {
    const ids = [...new Set(dto.ids)].filter((id) => id > 0);
    if (ids.length < 2) throw new BadRequestException('请至少选择两条影片');

    const rows = await this.prisma.$queryRaw<
      Array<{ id: number; name: string; year: number; status: number; collectedAt: Date | null; playCount: bigint | number; epTotal: bigint | number }>
    >(Prisma.sql`SELECT v.id, v.name, v.year, v.status, v.collected_at AS collectedAt,
        (SELECT COUNT(*) FROM lcm_vod_play p WHERE p.vod_id = v.id) AS playCount,
        (SELECT COALESCE(SUM(CASE WHEN p.play_url = '' THEN 0
            ELSE CHAR_LENGTH(p.play_url) - CHAR_LENGTH(REPLACE(p.play_url, '#', '')) + 1 END), 0)
          FROM lcm_vod_play p WHERE p.vod_id = v.id) AS epTotal
      FROM lcm_vod v WHERE v.id IN (${Prisma.join(ids)})`);

    const members: MergeMember[] = rows.map((row) => ({
      id: Number(row.id),
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

  /** 忽略 / 恢复一个重复分组 */
  async ignore(dto: VodMergeIgnoreDTO): Promise<{ ignored: boolean }> {
    const valid = dto.kind === 'same' ? isSameKey(dto.key) : isHashKey(dto.key);
    if (!valid) throw new BadRequestException('分组标识不正确');
    const kind = dto.kind === 'same' ? 2 : dto.kind === 'suspect' ? 2 : 1;
    return this.ignores.toggle({ mergeKey: ignoreKey(dto.kind, dto.key), kind, ignored: dto.ignored });
  }

  /** 一键合并全部可自动合并的分组 */
  async batch(dto: VodMergeBatchDTO): Promise<{ needConfirm: boolean; groups: number; vods: number; merged: number }> {
    const { auto } = await this.loadMergeCandidates();
    const vods = auto.reduce((sum, group) => sum + group.members.length - 1, 0);
    if (!dto.confirm) {
      return { needConfirm: true, groups: auto.length, vods, merged: 0 };
    }
    let merged = 0;
    for (const group of auto) merged += await this.mergeGroup(group.members);
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
    const valid = dto.keys.filter((item) => (item.kind === 'same' ? isSameKey(item.key) : isHashKey(item.key)));
    if (valid.length === 0) throw new BadRequestException('请先选择分组');

    const groups: MergeGroup[] = [];
    for (const { kind, key } of valid) {
      const group = await this.loadGroupDetail(kind, key);
      if (group) groups.push(group);
    }
    const mergeable = groups.filter((group) => yearCompatible(group.members));
    const skipped = groups.length - mergeable.length;
    const vods = mergeable.reduce((sum, group) => sum + group.members.length - 1, 0);

    if (!dto.confirm) {
      return {
        needConfirm: true,
        action: dto.action,
        groups: dto.action === 'merge' ? mergeable.length : groups.length,
        vods,
        merged: 0,
        skipped,
        ignored: 0,
      };
    }

    if (dto.action === 'ignore') {
      for (const group of groups) {
        await this.ignores.toggle({
          mergeKey: ignoreKey(group.kind, group.key),
          kind: group.kind === 'auto' ? 1 : 2,
          ignored: true,
        });
      }
      return { needConfirm: false, action: 'ignore', groups: groups.length, vods: 0, merged: 0, skipped: 0, ignored: groups.length };
    }

    let merged = 0;
    for (const group of mergeable) merged += await this.mergeGroup(group.members);
    return { needConfirm: false, action: 'merge', groups: mergeable.length, vods, merged, skipped, ignored: 0 };
  }
}
