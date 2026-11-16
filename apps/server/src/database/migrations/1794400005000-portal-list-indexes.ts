import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 前台列表页的两个索引。
 *
 * 1. `idx_status_created`：列表「最新入库」按 `created_at` 排序，原先没有索引，
 *    12 万行要 filesort（实测 7.4 秒）；建索引后 24ms。
 * 2. `idx_status_year`：年份筛选的 `SELECT DISTINCT year` 原先扫 status=1 的全部行
 *    （185~450ms），有索引后 100ms 左右（再叠加进程内 60 秒缓存）。
 *
 * 都用 information_schema 判存在，避免手工建过索引的库执行失败。
 */
export class PortalListIndexes1794400005000 implements MigrationInterface {
  name = 'PortalListIndexes1794400005000';

  private async hasIndex(queryRunner: QueryRunner, index: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'lcm_vod' AND index_name = ? LIMIT 1`,
      [index],
    );
    return rows.length > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasIndex(queryRunner, 'idx_status_created'))) {
      await queryRunner.query(
        'ALTER TABLE `lcm_vod` ADD INDEX `idx_status_created` (`status`, `created_at`, `id`)',
      );
    }
    if (!(await this.hasIndex(queryRunner, 'idx_status_year'))) {
      await queryRunner.query('ALTER TABLE `lcm_vod` ADD INDEX `idx_status_year` (`status`, `year`)');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner, 'idx_status_created')) {
      await queryRunner.query('ALTER TABLE `lcm_vod` DROP INDEX `idx_status_created`');
    }
    if (await this.hasIndex(queryRunner, 'idx_status_year')) {
      await queryRunner.query('ALTER TABLE `lcm_vod` DROP INDEX `idx_status_year`');
    }
  }
}
