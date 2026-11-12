import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 入库合并规则独立成表：一行一个字段（`rule_key` = `mode` 或 `lcm_vod` 字段名）。
 *
 * 以前整份规则是 `lcm_setting.merge_rules` 的一条 JSON，解析失败只能整包回落默认值，
 * 也定位不到是哪一项坏了。拆成行之后，字段元数据（中文名、可选策略、默认值）仍由
 * `collect/merge.ts` 的 `MERGE_FIELDS` 定义，本表只存「这个键选了哪个策略」。
 *
 * 只建表、不插数据：`loadMergeConfig` 在表为空时按默认值落库，并把旧 JSON 迁移一次。
 */
export class VodMergeRule1794400000000 implements MigrationInterface {
  name = 'VodMergeRule1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE lcm_vod_merge_rule (
        id bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
        created_at datetime(6) NOT NULL COMMENT '创建时间' DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL COMMENT '更新时间' DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        rule_key varchar(32) NOT NULL COMMENT '规则键：mode 或 lcm_vod 字段名' DEFAULT '',
        rule_value varchar(32) NOT NULL COMMENT '策略标识，取值由 merge.ts 的白名单校验' DEFAULT '',
        UNIQUE INDEX uk_rule_key (rule_key),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB COMMENT="影片入库合并规则：每个字段一行"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE lcm_vod_merge_rule');
  }
}
