import { DataSource, type DataSourceOptions } from 'typeorm';

/** TypeORM 自己建这张表时用的结构，这里保持一致，后续 runMigrations 才能接着用。 */
const HISTORY_TABLE_DDL =
  'CREATE TABLE `migrations` (`id` int NOT NULL AUTO_INCREMENT, `timestamp` bigint NOT NULL, `name` varchar(255) NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB';

/**
 * 兼容「表已经建好、但没有迁移记录」的老库。
 *
 * 早期用 `db:init` 直接按实体建表，库里没有 `migrations` 表；换成启动自动迁移后，
 * baseline 会再 CREATE TABLE 一次并撞表导致起不来。这里把现有迁移一次性标记为已执行，
 * 让老库能直接启动；要拿到字段注释只能手工 `DROP DATABASE` 后重启服务（迁移会自动重建）。
 *
 * 只判断 `lcm_vod` 是否存在：能建到这一步说明表结构是早期脚本按实体建的。
 *
 * 注意：「标记为已执行」不等于真的执行过。baseline（`1794310399174-init`）只覆盖当时那套表，
 * 之后的迁移里有真改结构的：`1794400000000` 建 `lcm_vod_merge_rule`、`1794400009000` 给
 * `lcm_play_line` 加 `source_id`。老库被直接标记后，这两张表/列永远不会被建出来，而
 * `synchronize: false` 也不会补——表现为启动成功、运行时 SQL 报未知表/未知列。
 * 真遇到老库，应该让它把这几条迁移执行一遍，而不是一律标记（届时按 errno 1050/1060/1061/1091
 * 容忍「已存在」即可）。
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
      `[schema] 库里已有表结构但没有迁移记录，已把 ${probe.migrations.length} 个迁移标记为已执行；` +
        'baseline 之后的建表/加列迁移并未真正执行，缺失的结构只会在运行时暴露',
    );
  } finally {
    await probe.destroy();
  }
}
