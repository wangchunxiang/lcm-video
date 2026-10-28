import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { vod, vodPlay } from '@lcm/db';
import { countEpisodes, htmlToSummary, htmlToText, nameHash, normalizeName } from '@lcm/shared';
import type { SourceVod } from './parser.ts';
import { splitPlayGroups } from './parser.ts';

export interface CategoryInfo {
  id: number;
  pid: number;
  name: string;
  matchNames: string[];
}

export interface MappingInfo {
  categoryId: number;
  status: number;
}

export interface Counters {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

export interface FailItem {
  vod_id: string;
  name: string;
  reason: string;
}

export interface PageInput {
  sourceId: number;
  items: SourceVod[];
  mapping: Map<string, MappingInfo>;
  categories: Map<number, CategoryInfo>;
  /** 指定目标影片 ID，忽略按名称年份判重（用于「重新采集单片」） */
  forceVodId?: number;
}

export interface PageResult {
  counters: Counters;
  fails: FailItem[];
}

interface VodRow {
  id: number;
  year: number;
}

interface PlayRow {
  id: number;
  vodId: number;
  sourceId: number;
  sourceFrom: string;
  sourceUpdatedAt: Date | null;
  playUrl: string;
}

const playKey = (vodId: number, sourceId: number, sourceFrom: string): string =>
  `${vodId}|${sourceId}|${sourceFrom}`;

/**
 * 处理一页数据。
 * 分类映射判定 → 判重 → 写 lcm_vod → 合并线路，全部在一个事务内完成，
 * 单条记录用 savepoint 保护，失败只回滚该条。
 */
export async function processPage(db: Db, input: PageInput): Promise<PageResult> {
  const counters: Counters = { total: 0, inserted: 0, updated: 0, skipped: 0, ignored: 0, failed: 0 };
  const fails: FailItem[] = [];
  const { sourceId, mapping, categories } = input;
  const seenLines = new Set<string>();

  // 先完成不依赖数据库的过滤：分类映射、必填校验
  const candidates: Array<{ item: SourceVod; categoryId: number; categoryPid: number; name: string; hash: string; year: number }> = [];

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
    if (map.status !== 1 || map.categoryId === 0) {
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
      fails.push({ vod_id: '', name: item.name, reason: '缺少 vod_id' });
      continue;
    }
    const name = normalizeName(item.name);
    if (!name) {
      counters.failed += 1;
      fails.push({ vod_id: item.vodId, name: item.name, reason: '缺少影片名称' });
      continue;
    }
    candidates.push({
      item,
      categoryId: category.id,
      categoryPid: category.pid,
      name,
      hash: nameHash(name),
      year: item.year || 0,
    });
  }

  if (candidates.length === 0) {
    return { counters, fails };
  }

  await withWriteLock(() =>
    db.transaction(async (tx) => {
    const hashes = [...new Set(candidates.map((c) => c.hash))];

    // 1. 按 name_hash 批量查重
    const existingVods = await tx
      .select({ id: vod.id, name: vod.name, nameHash: vod.nameHash, year: vod.year })
      .from(vod)
      .where(inArray(vod.nameHash, hashes));

    // hash → 候选影片（同哈希可能有多条，靠年份再筛）
    const index = new Map<string, VodRow[]>();
    for (const row of existingVods) {
      const list = index.get(row.nameHash);
      const item = { id: row.id, year: row.year };
      if (list) list.push(item);
      else index.set(row.nameHash, [item]);
    }

    // 2. 内存判重（年份相等或任一方为 0），多条命中取 id 最小
    const forced = input.forceVodId ?? 0;
    const matchedIds: number[] = [];
    const decisions = candidates.map((candidate) => {
      if (forced > 0) {
        matchedIds.push(forced);
        return { candidate, vodId: forced };
      }
      const hits = (index.get(candidate.hash) ?? []).filter(
        (row) => row.year === candidate.year || row.year === 0 || candidate.year === 0,
      );
      hits.sort((a, b) => a.id - b.id);
      const vodId = hits[0]?.id ?? 0;
      if (vodId > 0) matchedIds.push(vodId);
      return { candidate, vodId };
    });

    // 3. 批量取这些影片已有的线路
    const uniqueVodIds = [...new Set(matchedIds)];
    const plays: PlayRow[] =
      uniqueVodIds.length === 0
        ? []
        : await tx
            .select({
              id: vodPlay.id,
              vodId: vodPlay.vodId,
              sourceId: vodPlay.sourceId,
              sourceFrom: vodPlay.sourceFrom,
              sourceUpdatedAt: vodPlay.sourceUpdatedAt,
              playUrl: vodPlay.playUrl,
            })
            .from(vodPlay)
            .where(inArray(vodPlay.vodId, uniqueVodIds));

    const playsByKey = new Map<string, PlayRow>();
    for (const row of plays) playsByKey.set(playKey(row.vodId, row.sourceId, row.sourceFrom), row);

    // 4. 逐条写库
    for (const { candidate, vodId: matchedId } of decisions) {
      const { item, name, hash, categoryId, categoryPid, year } = candidate;
      const groups = splitPlayGroups(item.playFrom, item.playUrl);

      // 增量：同源同线路的 source_updated_at 与本次 vod_time 相同则整条跳过
      // 「重新采集单片」时强制重写，不做增量判断
      const updatedAt = item.updatedAt;
      if (forced === 0 && matchedId > 0 && groups.length > 0 && updatedAt !== null) {
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

      await tx.execute(sql`SAVEPOINT sp_item`);
      try {
        let vodId = matchedId;
        let insertedNow = false;

        const content = {
          name,
          nameHash: hash,
          subName: item.subName,
          letter: /^[A-Z0-9]$/.test(item.letter) ? item.letter : '',
          cover: item.cover,
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

        if (vodId === 0) {
          const inserted = await tx
            .insert(vod)
            .values({
              ...content,
              categoryId,
              categoryPid,
              status: 1,
            })
            .$returningId();
          vodId = inserted[0]?.id ?? 0;
          if (vodId === 0) throw new Error('写入影片失败，未取得自增 ID');
          insertedNow = true;

          // 同页内后续同名同年的记录也能判到这一条
          const list = index.get(hash);
          const row = { id: vodId, year };
          if (list) list.push(row);
          else index.set(hash, [row]);
        } else {
          await tx
            .update(vod)
            .set({ ...content, collectedAt: sql`GREATEST(collected_at, NOW())` })
            .where(eq(vod.id, vodId));
        }

        // 线路合并
        for (const group of groups) {
          if (group.from) seenLines.add(group.from);
          const key = playKey(vodId, sourceId, group.from);
          const prev = playsByKey.get(key);
          const newCount = countEpisodes(group.url);

          if (!prev) {
            await tx.insert(vodPlay).values({
              vodId,
              sourceId,
              sourceFrom: group.from,
              sourceVodId: item.vodId,
              sourceUpdatedAt: item.updatedAt,
              collectedAt: sql`NOW()`,
              playUrl: group.url,
            });
            playsByKey.set(key, {
              id: -1,
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

          await tx
            .update(vodPlay)
            .set({
              playUrl: group.url,
              sourceVodId: item.vodId,
              sourceUpdatedAt: item.updatedAt,
              collectedAt: sql`NOW()`,
            })
            .where(eq(vodPlay.id, prev.id));
          prev.playUrl = group.url;
          prev.sourceUpdatedAt = item.updatedAt;
        }

        await tx.execute(sql`RELEASE SAVEPOINT sp_item`);

        if (insertedNow) counters.inserted += 1;
        else counters.updated += 1;
      } catch (error) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT sp_item`);
        counters.failed += 1;
        if (fails.length < 100) {
          fails.push({
            vod_id: item.vodId,
            name,
            reason: describeError(error),
          });
        }
      }
    }
    }),
  );

  if (seenLines.size > 0) {
    await db.execute(
      sql`INSERT IGNORE INTO lcm_play_line (source_from) VALUES ${sql.join(
        [...seenLines].map((from) => sql`(${from})`),
        sql`, `,
      )}`,
    );
  }

  return { counters, fails };
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
 * drizzle 抛的 DrizzleQueryError 外层 message 是「Failed query: <SQL> params: ...」，
 * 真实原因在 cause 链上的 mysql2 错误里（sqlMessage / code），优先取它，
 * 取不到才退回外层 message 的第一行，并限制长度避免明细被超长 SQL 撑爆。
 */
function describeError(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const extra = current as Error & { sqlMessage?: string; code?: string; cause?: unknown };
    if (extra.sqlMessage) {
      return extra.code ? `${extra.sqlMessage} (${extra.code})` : extra.sqlMessage;
    }
    current = extra.cause;
  }
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n')[0] ?? message;
  return firstLine.slice(0, 300);
}
