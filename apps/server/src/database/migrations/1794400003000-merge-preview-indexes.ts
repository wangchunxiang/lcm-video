import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 重复影片预览的两个覆盖索引。
 *
 * 12 万部影片的库里，预览原先用 `WHERE name_hash IN (1 万个值)` 拉成员行：
 * 每条都要回表读 `lcm_vod`（238MB，含 intro/content 等长文本），21k 行要 12 秒。
 * 这两条索引让「按哈希分组 + 读 name/year/status/collected_at」变成索引覆盖扫描。
 */
export class MergePreviewIndexes1794400003000 implements MigrationInterface {
  name = 'MergePreviewIndexes1794400003000';

  private async hasIndex(queryRunner: QueryRunner, index: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'lcm_vod' AND index_name = ? LIMIT 1`,
      [index],
    );
    return rows.length > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasIndex(queryRunner, 'idx_merge_preview'))) {
      await queryRunner.query(
        'ALTER TABLE `lcm_vod` ADD INDEX `idx_merge_preview` (`name_hash`, `name`, `year`, `status`, `collected_at`)',
      );
    }
    if (!(await this.hasIndex(queryRunner, 'idx_merge_loose'))) {
      await queryRunner.query(
        'ALTER TABLE `lcm_vod` ADD INDEX `idx_merge_loose` (`name_hash_loose`, `name_hash`)',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner, 'idx_merge_preview')) {
      await queryRunner.query('ALTER TABLE `lcm_vod` DROP INDEX `idx_merge_preview`');
    }
    if (await this.hasIndex(queryRunner, 'idx_merge_loose')) {
      await queryRunner.query('ALTER TABLE `lcm_vod` DROP INDEX `idx_merge_loose`');
    }
  }
}
