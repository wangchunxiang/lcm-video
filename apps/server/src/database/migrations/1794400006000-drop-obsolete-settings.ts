import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 清掉四个已废弃的配置键：`site_theme`、`site_logo`、`site_favicon`、`upload_max_mb`。
 *
 * 它们原先靠「后台设置页 → 元数据 → 配置键」这条链路存在，现在：
 * - 主题不再可切换（`apps/web` 只有一套 Tailwind 样式）；
 * - logo / favicon 内置在 `apps/web/public/img/`，不再由配置提供；
 * - 站点不提供文件上传。
 *
 * 所以 `packages/shared/src/settings.ts` 的 `SETTINGS` 元数据已经删掉这四项，
 * 库里残留的行只会让 `SettingService.map()` 返回没人读的键，顺手清掉。
 *
 * 可空表也可能根本没这两行，`DELETE` 天然幂等，不需要 `information_schema` 判存在。
 */
export class DropObsoleteSettings1794400006000 implements MigrationInterface {
  name = 'DropObsoleteSettings1794400006000';

  private readonly keys = ['site_theme', 'site_logo', 'site_favicon', 'upload_max_mb'];

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM `lcm_setting` WHERE `name` IN (?, ?, ?, ?)', this.keys);
  }

  /** 只删不建，回滚无内容可做（旧值已随元数据一起废弃）。 */
  async down(): Promise<void> {
    // 有意留空。
  }
}
