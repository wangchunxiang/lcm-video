import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `lcm_vod.updated_at` 加索引：后台概览的「最新更新」卡要按它倒序取 8 条。
 *
 * `lcm_vod` 有 12 万行且这张表平时是批量写（采集整站一次几千条），
 * `ORDER BY updated_at DESC LIMIT 8` 没有索引时是整表 filesort，
 * 实测 1.34 秒——一屏概览不该有这样的查询。加索引后走倒序扫描，毫秒级。
 *
 * 只加单列索引：它是给「最近更新」用的，不需要和状态/分类组合。
 */
export class VodUpdatedAtIndex1794400010000 implements MigrationInterface {
  name = 'VodUpdatedAtIndex1794400010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `lcm_vod` ADD INDEX `idx_updated_at` (`updated_at`)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `lcm_vod` DROP INDEX `idx_updated_at`');
  }
}
