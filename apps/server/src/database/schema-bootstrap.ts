import { DataSource, type DataSourceOptions } from 'typeorm';

/** TypeORM 自己建这张表时用的结构，这里保持一致，后续 runMigrations 才能接着用。 */
const HISTORY_TABLE_DDL =
  'CREATE TABLE `migrations` (`id` int NOT NULL AUTO_INCREMENT, `timestamp` bigint NOT NULL, `name` varchar(255) NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB';

/**
 * 兼容「表已经建好、但没有迁移记录」的老库。
 *
 * 早期用 `db:init` 直接按实体建表，库里没有 `migrations` 表；换成启动自动迁移后，
 * baseline 会再 CREATE TABLE 一次并撞表导致起不来。这里把现有迁移一次性标记为已执行，
 * 让老库能直接启动；要拿到字段注释需要重建库（`npm run db:reset` 或手工 DROP）。
 *
 * 只判断 `lcm_vod` 是否存在：能建到这一步说明表结构是早期脚本按实体建的，
 * 与 baseline 的差异仅限注释。
 */
export async function adoptExistingSchema(options: DataSourceOptions): Promise<void> {
  const probe = new DataSource({ ...options, migrationsRun: false });
  await probe.initialize();
  try {
    const hasHistory = await probe.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'migrations' LIMIT 1",
    );
    if (hasHistory.length > 0) return;

    const hasTables = await probe.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'lcm_vod' LIMIT 1",
    );
    if (hasTables.length === 0) return;

    await probe.query(HISTORY_TABLE_DDL);
    for (const migration of probe.migrations) {
      // TypeORM 在加载迁移时把 name / timestamp 挂到实例上，接口里没有声明这两个字段。
      const { name, timestamp } = migration as { name?: string; timestamp?: number };
      await probe.query('INSERT INTO `migrations` (`timestamp`, `name`) VALUES (?, ?)', [
        timestamp ?? 0,
        name ?? migration.constructor.name,
      ]);
    }
    console.warn(
      `[schema] 库里已有表结构但没有迁移记录，已把 ${probe.migrations.length} 个迁移标记为已执行；如需补齐字段注释请重建库`,
    );
  } finally {
    await probe.destroy();
  }
}
