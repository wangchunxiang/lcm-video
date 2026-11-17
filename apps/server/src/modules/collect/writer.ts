import { In } from 'typeorm';
import type { DataSource } from 'typeorm';
import {
  applyCoverRules,
  applyPlayUrlRules,
  countEpisodes,
  hostOf,
  htmlToSummary,
  htmlToText,
  looseHash,
  nameHash,
  normalizeCover,
  normalizeName,
} from '@lcm/shared';
import { SourceRuleEntity } from '../source-rule/source-rule.entity';
import { VodPlayEntity } from '../vod-play/vod-play.entity';
import { VodEntity } from '../vod/vod.entity';
import { mergeVodContent, type MergeConfig, type MergeableVod } from './merge';
import { splitPlayGroups } from './parser';
import { ID_NONE, compareId, emptyCounters, hasId } from './types';
import type { CategoryInfo, Counters, FailItem, MappingInfo, SourceVod } from './types';
import { PlayLineEntity } from '../play-line/play-line.entity';

export interface PageInput {
  sourceId: string;
  items: SourceVod[];
  mapping: Map<string, MappingInfo>;
  categories: Map<string, CategoryInfo>;
  /** 指定目标影片 ID，忽略按名称年份判重（用于「重新采集单片」） */
  forceVodId?: string;
  /** 重采等修数据场景：不刷新 collected_at，避免把老片顶到「最新更新」 */
  keepCollectedAt?: boolean;
  /** 入库规则：跨源命中同一条影片时按字段合并；不传或 mode=off 时整行覆盖 */
  merge?: MergeConfig;
  /** 图片体检判定为失效的封面域名，合并时优先换掉 */
  brokenCoverHosts?: Set<string>;
}

export interface PageResult {
  counters: Counters;
  fails: FailItem[];
}

interface VodRow {
  id: string;
  year: number;
}

/** 一页里待写入的一条：已解析好分类与哈希，判重时只需要它 */
interface Candidate {
  item: SourceVod;
  categoryId: string;
  categoryPid: string;
  name: string;
  hash: string;
  looseHash: string;
  year: number;
}

interface PlayRow {
  id: string;
  vodId: string;
  sourceId: string | null;
  sourceFrom: string;
  sourceUpdatedAt: Date | null;
  playUrl: string;
}

const playKey = (vodId: string, sourceId: string, sourceFrom: string): string =>
  `${vodId}|${sourceId}|${sourceFrom}`;

/**
 * 处理一页数据。
 * 分类映射判定 → 判重 → 写 lcm_vod → 合并线路，全部在一个事务内完成，
 * 单条记录用 savepoint 保护，失败只回滚该条。
 */
export async function processPage(dataSource: DataSource, input: PageInput): Promise<PageResult> {
  const counters = emptyCounters();
  const fails: FailItem[] = [];
  const { sourceId, mapping, categories } = input;
  const seenLines = new Set<string>();

  // 源站地址替换规则：写库前统一套用，播放与图片分开
  const rules = await dataSource.getRepository(SourceRuleEntity).find({
    where: { sourceId },
    select: { kind: true, fromUrl: true, toUrl: true, isEnabled: true, sort: true },
    order: { sort: 'ASC' },
  });
  const playRules = rules.filter((rule) => rule.kind === 1);
  const coverRules = rules.filter((rule) => rule.kind === 2);

  const candidates: Candidate[] = [];

  for (const item of input.items) {
    counters.total += 1;

    const map = mapping.get(item.typeId);
    if (!map) {
      counters.skipped += 1;
      continue;
    }
    if (map.status === 2) {
      counters.ignored += 1;
      continue;
    }
    if (map.status !== 1 || !hasId(map.categoryId)) {
      counters.skipped += 1;
      continue;
    }
    const category = categories.get(map.categoryId);
    if (!category) {
      counters.skipped += 1;
      continue;
    }

    if (!item.vodId) {
      counters.failed += 1;
      fails.push({ vodId: '', name: item.name, reason: '缺少 vod_id' });
      continue;
    }
    const name = normalizeName(item.name);
    if (!name) {
      counters.failed += 1;
      fails.push({ vodId: item.vodId, name: item.name, reason: '缺少影片名称' });
      continue;
    }
    candidates.push({
      item,
      categoryId: category.id,
      categoryPid: category.pid,
      name,
      hash: nameHash(name),
      looseHash: looseHash(name),
      year: item.year || 0,
    });
  }

  if (candidates.length === 0) return { counters, fails };

  await withWriteLock(() =>
    dataSource.transaction(async (manager) => {
      const vodRepository = manager.getRepository(VodEntity);
      const playRepository = manager.getRepository(VodPlayEntity);
      const hashes = [...new Set(candidates.map((c) => c.hash))];

      // 1. 按 nameHash 批量查重
      const existingVods = await vodRepository.find({
        where: { nameHash: In(hashes) },
        select: { id: true, nameHash: true, year: true },
      });

      const index = new Map<string, VodRow[]>();
      for (const row of existingVods) {
        const list = index.get(row.nameHash);
        const item = { id: row.id, year: row.year };
        if (list) list.push(item);
        else index.set(row.nameHash, [item]);
      }

      // 2. 同一采集源里 source_vod_id 是不变的身份：优先用它认片，
      //    避免源站改标题 / 改年份时被当成新片插一条重复记录
      const sourceVodIds = [...new Set(candidates.map((c) => c.item.vodId).filter(Boolean))];
      const sameSource =
        sourceVodIds.length === 0
          ? []
          : await playRepository.find({
              where: { sourceId, sourceVodId: In(sourceVodIds) },
              select: { vodId: true, sourceVodId: true },
            });

      const bySourceVodId = new Map<string, string>();
      for (const row of sameSource) {
        const prev = bySourceVodId.get(row.sourceVodId);
        if (prev === undefined || compareId(row.vodId, prev) < 0) {
          bySourceVodId.set(row.sourceVodId, row.vodId);
        }
      }

      // 3. 判重（年份相等或任一方为 0），多条命中取 id 最小；同一源里优先用 source_vod_id
      const forced = input.forceVodId ?? ID_NONE;
      const forcedOn = hasId(forced);
      const matchVodId = (candidate: Candidate): string => {
        if (forcedOn) return forced;
        const known = bySourceVodId.get(candidate.item.vodId);
        if (known !== undefined) return known;
        const hits = (index.get(candidate.hash) ?? []).filter(
          (row) => row.year === candidate.year || row.year === 0 || candidate.year === 0,
        );
        hits.sort((a, b) => compareId(a.id, b.id));
        return hits[0]?.id ?? ID_NONE;
      };
      const matchedIds: string[] = [];
      for (const candidate of candidates) {
        const vodId = matchVodId(candidate);
        if (hasId(vodId)) matchedIds.push(vodId);
      }

      // 4. 批量取这些影片已有的线路
      const uniqueVodIds = [...new Set(matchedIds)];
      const plays: PlayRow[] =
        uniqueVodIds.length === 0
          ? []
          : await playRepository.find({
              where: { vodId: In(uniqueVodIds) },
              select: {
                id: true,
                vodId: true,
                sourceId: true,
                sourceFrom: true,
                sourceUpdatedAt: true,
                playUrl: true,
              },
            });

      const playsByKey = new Map<string, PlayRow>();
      for (const row of plays) playsByKey.set(playKey(row.vodId, row.sourceId ?? ID_NONE, row.sourceFrom), row);

      // 入库规则：命中已有影片时取旧值做字段级合并；关闭时整行覆盖
      const mergeOn = input.merge?.mode === 'merge';
      const brokenCoverHosts = input.brokenCoverHosts ?? new Set<string>();
      const oldRows = mergeOn && uniqueVodIds.length > 0
        ? await vodRepository.find({ where: { id: In(uniqueVodIds) } })
        : [];
      const oldById = new Map(oldRows.map((row) => [row.id, row]));

      // 5. 逐条写库。判重放在循环里做：同一页里先后出现的同名影片能判到刚插入的那条，
      //    不会因为「两条都在预扫时没命中」而各插一行。
      const insertedNowIds = new Set<string>();
      for (const candidate of candidates) {
        const { item, name, hash, looseHash: loose, categoryId, categoryPid, year } = candidate;
        const matchedId = matchVodId(candidate);
        const groups = splitPlayGroups(item.playFrom, item.playUrl).map((group) => ({
          ...group,
          url: applyPlayUrlRules(group.url, playRules),
        }));

        // 增量：同源同线路的 sourceUpdatedAt 与本次 vod_time 相同则整条跳过
        const updatedAt = item.updatedAt;
        if (!forcedOn && hasId(matchedId) && groups.length > 0 && updatedAt !== null) {
          const unchanged = groups.every((group) => {
            const prev = playsByKey.get(playKey(matchedId, sourceId, group.from));
            return (
              prev !== undefined &&
              prev.sourceUpdatedAt !== null &&
              prev.sourceUpdatedAt.getTime() === updatedAt.getTime()
            );
          });
          if (unchanged) {
            counters.skipped += 1;
            continue;
          }
        }

        // 每条前面打一个同名 savepoint：MySQL 里重名会覆盖上一个，所以不必 RELEASE，
        // 省掉每条一次往返（一页 100 条就少 100 次网络往返）。
        await manager.query('SAVEPOINT sp_item');
        try {
          let vodId = matchedId;
          let insertedNow = false;

          const cover = applyCoverRules(normalizeCover(item.cover), coverRules);
          const content: MergeableVod = {
            name,
            nameHash: hash,
            nameHashLoose: loose,
            subName: item.subName,
            cover,
            coverHost: cover ? hostOf(cover) : '',
            actor: item.actor,
            director: item.director,
            writer: item.writer,
            intro: htmlToSummary(item.intro),
            content: htmlToText(item.content),
            remarks: item.remarks,
            releaseDate: item.releaseDate,
            episodeCount: item.episodeCount,
            area: item.area,
            lang: item.lang,
            year,
          };
          const collectedAt = input.keepCollectedAt ? undefined : new Date();

          if (!hasId(vodId)) {
            const created = await vodRepository.save(
              vodRepository.create({ ...content, categoryId, categoryPid, status: 1 }),
            );
            vodId = created.id;
            insertedNow = true;

            // 同页内后续同名同年的记录也能判到这一条
            const list = index.get(hash);
            const row = { id: vodId, year };
            if (list) list.push(row);
            else index.set(hash, [row]);
            insertedNowIds.add(vodId);
            bySourceVodId.set(item.vodId, vodId);
          } else if (insertedNowIds.has(vodId)) {
            // 同一页里同名影片的第二条：字段保留先插入那条，只并线路
          } else if (mergeOn) {
            const old = oldById.get(vodId);
            const patch: Partial<VodEntity> = old
              ? mergeVodContent(old, content, input.merge!, {
                  trusted: bySourceVodId.get(item.vodId) === vodId,
                  brokenCoverHosts,
                })
              : { ...content };
            if (Object.keys(patch).length > 0) {
              await vodRepository.update(
                { id: vodId },
                collectedAt === undefined ? patch : { ...patch, collectedAt },
              );
            }
          } else {
            await vodRepository.update(
              { id: vodId },
              { ...content, categoryId, categoryPid, ...(collectedAt === undefined ? {} : { collectedAt }) },
            );
          }

          // 线路合并
          for (const group of groups) {
            if (group.from) seenLines.add(group.from);
            const key = playKey(vodId, sourceId, group.from);
            const prev = playsByKey.get(key);
            const newCount = countEpisodes(group.url);

            if (!prev) {
              const created = await playRepository.save(
                playRepository.create({
                  vodId,
                  sourceId,
                  sourceFrom: group.from,
                  sourceVodId: item.vodId,
                  sourceUpdatedAt: item.updatedAt,
                  collectedAt: new Date(),
                  playUrl: group.url,
                }),
              );
              playsByKey.set(key, {
                id: created.id,
                vodId,
                sourceId,
                sourceFrom: group.from,
                sourceUpdatedAt: item.updatedAt,
                playUrl: group.url,
              });
              continue;
            }

            // 新集数少于旧集数视为源站数据残缺，保留原值
            if (newCount < countEpisodes(prev.playUrl)) continue;

            await playRepository.update(
              { id: prev.id },
              {
                playUrl: group.url,
                sourceVodId: item.vodId,
                sourceUpdatedAt: item.updatedAt,
                collectedAt: new Date(),
              },
            );
            prev.playUrl = group.url;
            prev.sourceUpdatedAt = item.updatedAt;
          }

          if (insertedNow) counters.inserted += 1;
          else counters.updated += 1;
        } catch (error) {
          await manager.query('ROLLBACK TO SAVEPOINT sp_item');
          counters.failed += 1;
          if (fails.length < 100) {
            fails.push({ vodId: item.vodId, name, reason: describeError(error) });
          }
        }
      }
    }),
  );

  if (seenLines.size > 0) {
    // 全站线路注册表：已在表里的保持原状（不改显示名/排序），只补缺失的
    await insertIgnorePlayLines(dataSource, [...seenLines]);
  }

  return { counters, fails };
}

/** 一次登记多条线路；已存在的保持原状（`orIgnore` = `INSERT IGNORE`） */
async function insertIgnorePlayLines(dataSource: DataSource, lines: string[]): Promise<void> {
  await dataSource
    .createQueryBuilder()
    .insert()
    .into(PlayLineEntity)
    .values(lines.map((line) => ({ sourceFrom: line })))
    .orIgnore()
    .execute();
}

/**
 * 进程内的写入串行锁。
 * 多源并行采集时，「查重 + 写库」这一段必须串行，否则两个源同时采到同一部影片会各建一条。
 * 只包住事务本身（毫秒级），网络请求不持锁。
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run: Promise<T> = writeChain.then(fn, fn);
  writeChain = run.catch(() => undefined);
  return run;
}

/**
 * 取出可读的错误说明。
 * TypeORM/驱动外层 message 常常是「QueryFailedError: ...」，真实原因在 cause 链上。
 */
export function describeError(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const extra = current as Error & { sqlMessage?: string; code?: string; cause?: unknown };
    if (extra.sqlMessage) return extra.code ? `${extra.sqlMessage} (${extra.code})` : extra.sqlMessage;
    current = extra.cause;
  }
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n').filter((line) => line.trim() !== '')[0] ?? message;
  return firstLine.slice(0, 300);
}
