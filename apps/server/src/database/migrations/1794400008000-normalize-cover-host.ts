import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 把 `cover_host` 统一成「小写、不带端口」。
 *
 * 这一列是 `cover` 的冗余派生列（写入时用 `hostOf()` 算，逻辑见
 * `packages/shared/src/util.ts`），但旧库导入时是原样搬过来的，里面有一批带端口的
 * 写法（`www.imgzy360.com:7788` 共 1.6 万条）。而「图片域名体检」抽查时会用
 * `hostOf(cover)` 重新算一遍域名再和这一列比，两边口径不一致就抽不到样本，
 * 于是这些域名每次都报「库里没有该域名的图片」。
 *
 * 数据统一后，`cover_host` 与 `hostOf(cover)` 恒定一致；`lcm_cover_check` 里
 * 带端口的旧快照行直接删掉（`uk_host` 唯一索引也不允许它和新口径共存），重扫即可。
 */
export class NormalizeCoverHost1794400008000 implements MigrationInterface {
  name = 'NormalizeCoverHost1794400008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DELETE FROM `lcm_cover_check` WHERE `host` <> LOWER(REGEXP_REPLACE(`host`, ':[0-9]+$', ''))",
    );
    await queryRunner.query(
      "UPDATE `lcm_vod` SET `cover_host` = LOWER(REGEXP_REPLACE(`cover_host`, ':[0-9]+$', '')) WHERE `cover_host` <> LOWER(REGEXP_REPLACE(`cover_host`, ':[0-9]+$', ''))",
    );
  }

  /** 端口信息已经丢了，原始值没有备份，回滚只能什么都不做 */
  async down(): Promise<void> {
    // 无操作：数据清洗类迁移，硬造回原值没有意义
  }
}
