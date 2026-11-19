import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 线路的归属从「源站上记一串线路标识」改成「线路表上记供给它的源」。
 *
 * 原来 `lcm_collect_source.play_from` 存的是一串线路标识（`dyttm3u8,ffm3u8`），
 * 后台线路表的「来源」列靠它反查源站名。这条路有两个问题：
 * 1. 是冗余快照，需要采集时回写一次，少写一次就是空的（线上 6 条线路里 5 条空）；
 * 2. 一条线路只可能由一个源供应，把它存在源站上等于把「归属」存到了错误的一侧。
 *
 * 改成 `lcm_play_line.source_id`：采集首次登记这条线路时写入，之后不再变
 * （线路标识本身创建后不可改）。`play_from` 一并删掉，取值只留一条路径。
 */
export class PlayLineSource1794400009000 implements MigrationInterface {
  name = 'PlayLineSource1794400009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `lcm_play_line` ADD COLUMN `source_id` bigint UNSIGNED NULL COMMENT '供应该线路的采集源：首次登记时写入，手工维护的线路为 NULL' AFTER `source_from`",
    );
    await queryRunner.query('ALTER TABLE `lcm_play_line` ADD INDEX `idx_source_id` (`source_id`)');
    await queryRunner.query('ALTER TABLE `lcm_collect_source` DROP COLUMN `play_from`');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`lcm_collect_source\` ADD COLUMN \`play_from\` varchar(500) NOT NULL COMMENT '最近一次采集到的线路标识，逗号分隔，后台候选提示用' DEFAULT ''`,
    );
    await queryRunner.query('ALTER TABLE `lcm_play_line` DROP INDEX `idx_source_id`');
    await queryRunner.query('ALTER TABLE `lcm_play_line` DROP COLUMN `source_id`');
  }
}
