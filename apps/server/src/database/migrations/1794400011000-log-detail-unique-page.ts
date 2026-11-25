import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `lcm_collect_task_log_detail` 的 `idx_log_page` 改成唯一索引。
 *
 * 这张表一行代表「某次采集记录的某一页」，`writeDetail()` 的逻辑就是「有则改、无则插」。
 * 原来只有普通索引，只能先 `findOne` 再决定 `update` / `save`——先读后写，两次往返，
 * 而且并发的两页写同一行时会各自插入一条重复行（库里现在 1008 行没有重复，是运气）。
 *
 * 加了唯一约束后可以直接 `upsert`，一条语句完成，重复行在库里就不可能存在。
 */
export class LogDetailUniquePage1794400011000 implements MigrationInterface {
  name = 'LogDetailUniquePage1794400011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `lcm_collect_task_log_detail` DROP INDEX `idx_log_page`, ADD UNIQUE INDEX `uk_log_page` (`log_id`, `page`)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `lcm_collect_task_log_detail` DROP INDEX `uk_log_page`, ADD INDEX `idx_log_page` (`log_id`, `page`)',
    );
  }
}
