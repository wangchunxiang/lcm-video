import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 上映日期保留源站原文，不做规范化/截断：旧库这一列是 varchar(255)，最长的一条 72 字符。
 * baseline 里建成了 varchar(20)，这里放宽回 255。
 */
export class WidenReleaseDate1794400001000 implements MigrationInterface {
  name = 'WidenReleaseDate1794400001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `lcm_vod` MODIFY `release_date` varchar(255) NOT NULL DEFAULT '' COMMENT '上映日期，源站原文，不做规范化'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `lcm_vod` MODIFY `release_date` varchar(20) NOT NULL DEFAULT '' COMMENT '上映日期，源站原文（Y-m-d / Y）'",
    );
  }
}
