import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 替换规则从「前缀替换」改成「地址里出现就替换」，两个字段的列注释同步改掉，
 * 免得库里写的还是「前缀」，看表的人按旧语义理解。
 */
export class SourceRuleComments1794400002000 implements MigrationInterface {
  name = 'SourceRuleComments1794400002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `lcm_source_rule` MODIFY `from_url` varchar(255) NOT NULL DEFAULT '' COMMENT '原地址：地址中出现即替换，可省略协议'",
    );
    await queryRunner.query(
      "ALTER TABLE `lcm_source_rule` MODIFY `to_url` varchar(255) NOT NULL DEFAULT '' COMMENT '新地址：可省略协议，空表示删除这段地址'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `lcm_source_rule` MODIFY `from_url` varchar(255) NOT NULL DEFAULT '' COMMENT '源地址前缀'",
    );
    await queryRunner.query(
      "ALTER TABLE `lcm_source_rule` MODIFY `to_url` varchar(255) NOT NULL DEFAULT '' COMMENT '替换成的前缀，空表示删除该前缀'",
    );
  }
}
