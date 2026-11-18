import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 替换规则的原地址从「一个」改成「多个」：源站换域名时老域名往往有一串
 * （图床尤其如此），一条规则里把这些老地址都写上、共用同一个新地址，重刷一次全改完。
 *
 * 因此 `from_url` 改成 `text`（多行，一行一条），原来的
 * `uk_source_kind_from (source_id, kind, from_url)` 唯一索引没意义了（多值文本无法做
 * 全列索引），去掉，改由服务层 `assertNoOverlap` 保证同一原地址不出现在两条规则里。
 */
export class SourceRuleMultiFrom1794400007000 implements MigrationInterface {
  name = 'SourceRuleMultiFrom1794400007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `lcm_source_rule` DROP INDEX `uk_source_kind_from`');
    await queryRunner.query(
      "ALTER TABLE `lcm_source_rule` MODIFY `from_url` text NOT NULL COMMENT '原地址（可多条，一行一条）：地址中出现即替换，可省略协议'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `lcm_source_rule` MODIFY `from_url` varchar(255) NOT NULL DEFAULT '' COMMENT '原地址：地址中出现即替换，可省略协议'",
    );
    await queryRunner.query(
      'ALTER TABLE `lcm_source_rule` ADD UNIQUE INDEX `uk_source_kind_from` (`source_id`, `kind`, `from_url`)',
    );
  }
}
