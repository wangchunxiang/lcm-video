import { sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';

/**
 * 数据一致性巡检。
 *
 * 本项目不用数据库外键（删除路径都由逻辑层负责），所以孤儿行只能靠这里兜底：
 * 线路指向的影片或采集源已不存在、映射指向的源站/分类已删除、任务与广告特征
 * 指向的源站已删除，都会在这里查出来并清理。
 */
export interface IntegrityReport {
  /** 播放线路指向的影片不存在 */
  playsWithoutVod: number;
  /** 播放线路指向的采集源不存在 */
  playsWithoutSource: number;
  /** 分类映射指向的采集源不存在 */
  mappingsWithoutSource: number;
  /** 分类映射指向的分类不存在（0 表示未映射，不算孤儿） */
  mappingsWithoutCategory: number;
  /** 采集任务指向的采集源不存在 */
  tasksWithoutSource: number;
  /** 广告特征指向的采集源不存在 */
  adFeaturesWithoutSource: number;
  /** 在架但一条线路都没有的影片（不属于孤儿，单独提示） */
  emptyVods: number;
}

type CountRow = { total: number | string };

async function count(db: Db, query: ReturnType<typeof sql>): Promise<number> {
  const [rows] = await db.execute(query);
  const row = (rows as unknown as CountRow[])[0];
  return Number(row?.total ?? 0);
}

/** 只读巡检，不做任何修改 */
export async function auditIntegrity(db: Db): Promise<IntegrityReport> {
  const [
    playsWithoutVod,
    playsWithoutSource,
    mappingsWithoutSource,
    mappingsWithoutCategory,
    tasksWithoutSource,
    adFeaturesWithoutSource,
    emptyVods,
  ] = await Promise.all([
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_vod_play p
          LEFT JOIN lcm_vod v ON v.id = p.vod_id
          WHERE v.id IS NULL`,
    ),
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_vod_play p
          LEFT JOIN lcm_collect_source s ON s.id = p.source_id
          WHERE s.id IS NULL`,
    ),
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_collect_source_category c
          LEFT JOIN lcm_collect_source s ON s.id = c.source_id
          WHERE s.id IS NULL`,
    ),
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_collect_source_category c
          LEFT JOIN lcm_category k ON k.id = c.category_id
          WHERE c.category_id > 0 AND k.id IS NULL`,
    ),
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_collect_task t
          LEFT JOIN lcm_collect_source s ON s.id = t.source_id
          WHERE s.id IS NULL`,
    ),
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_ad_feature a
          LEFT JOIN lcm_collect_source s ON s.id = a.source_id
          WHERE s.id IS NULL`,
    ),
    count(
      db,
      sql`SELECT COUNT(*) AS total FROM lcm_vod v
          LEFT JOIN lcm_vod_play p ON p.vod_id = v.id
          WHERE v.status = 1 AND p.id IS NULL`,
    ),
  ]);

  return {
    playsWithoutVod,
    playsWithoutSource,
    mappingsWithoutSource,
    mappingsWithoutCategory,
    tasksWithoutSource,
    adFeaturesWithoutSource,
    emptyVods,
  };
}

/** 删除孤儿行，返回各表实际删除数量 */
export async function cleanOrphans(db: Db): Promise<Record<string, number>> {
  const statements: Array<[string, ReturnType<typeof sql>]> = [
    [
      'playsWithoutVod',
      sql`DELETE p FROM lcm_vod_play p
          LEFT JOIN lcm_vod v ON v.id = p.vod_id
          WHERE v.id IS NULL`,
    ],
    [
      'playsWithoutSource',
      sql`DELETE p FROM lcm_vod_play p
          LEFT JOIN lcm_collect_source s ON s.id = p.source_id
          WHERE s.id IS NULL`,
    ],
    [
      'mappingsWithoutSource',
      sql`DELETE c FROM lcm_collect_source_category c
          LEFT JOIN lcm_collect_source s ON s.id = c.source_id
          WHERE s.id IS NULL`,
    ],
    [
      'mappingsWithoutCategory',
      sql`DELETE c FROM lcm_collect_source_category c
          LEFT JOIN lcm_category k ON k.id = c.category_id
          WHERE c.category_id > 0 AND k.id IS NULL`,
    ],
    [
      'tasksWithoutSource',
      sql`DELETE t FROM lcm_collect_task t
          LEFT JOIN lcm_collect_source s ON s.id = t.source_id
          WHERE s.id IS NULL`,
    ],
    [
      'adFeaturesWithoutSource',
      sql`DELETE a FROM lcm_ad_feature a
          LEFT JOIN lcm_collect_source s ON s.id = a.source_id
          WHERE s.id IS NULL`,
    ],
  ];

  const result: Record<string, number> = {};
  for (const [name, statement] of statements) {
    const [rows] = await db.execute(statement);
    const affected = (rows as unknown as { affectedRows?: number }).affectedRows;
    result[name] = Number(affected ?? 0);
  }
  return result;
}
