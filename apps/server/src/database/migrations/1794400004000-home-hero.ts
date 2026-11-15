import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 首页 hero 单独建表：以前 hero 是「今日更新前 5 部」算出来的，没法人工编排。
 *
 * 表里只存运营配置（覆盖值留空串表示用影片自己的值），片名/年份/地区/分类实时读
 * `lcm_vod`。一个轮播位对应一部库内影片，`uk_vod` 保证同一部片不占两个位。
 */
export class HomeHero1794400004000 implements MigrationInterface {
  name = 'HomeHero1794400004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE lcm_home_hero (
        id bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
        created_at datetime(6) NOT NULL COMMENT '创建时间' DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL COMMENT '更新时间' DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        vod_id bigint UNSIGNED NOT NULL COMMENT 'lcm_vod.id' DEFAULT 0,
        title varchar(255) NOT NULL COMMENT '展示标题，空串用影片名' DEFAULT '',
        sub_title varchar(255) NOT NULL COMMENT '副标题文案，空串不显示' DEFAULT '',
        bg_image varchar(1000) NOT NULL COMMENT '通栏横幅图（16:9 或更宽），空串用影片封面' DEFAULT '',
        remarks varchar(255) NOT NULL COMMENT '角标文案，空串用影片备注' DEFAULT '',
        sort int UNSIGNED NOT NULL COMMENT '排序，小的在前' DEFAULT 0,
        is_show tinyint UNSIGNED NOT NULL COMMENT '1 显示 0 隐藏' DEFAULT 1,
        start_at datetime NULL COMMENT '定时上线，NULL 表示立即' DEFAULT NULL,
        end_at datetime NULL COMMENT '定时下线，NULL 表示长期' DEFAULT NULL,
        UNIQUE INDEX uk_vod (vod_id),
        INDEX idx_show_sort (is_show, sort),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB COMMENT="首页 hero 轮播位；只存运营配置，影片内容实时读 lcm_vod"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE lcm_home_hero');
  }
}
