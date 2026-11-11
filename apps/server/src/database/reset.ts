import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '../config/typeorm.config';

/**
 * 开发用：删掉库里的全部表，再按迁移重新建一遍（用来拿到最新的表结构 / 注释）。
 * 生产库不要用，所以要求显式 `--force`。
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 未配置');
    process.exit(1);
  }
  if (!process.argv.includes('--force')) {
    console.error('这会 DROP 掉 DATABASE_URL 指向库里所有表；确认要重建请加 --force');
    process.exit(1);
  }

  const dataSource = new DataSource({ ...createDataSourceOptions(url), migrationsRun: false });
  await dataSource.initialize();

  const tables: Array<{ name: string }> = await dataSource.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  for (const table of tables) {
    await dataSource.query(`DROP TABLE IF EXISTS \`${table.name}\``);
  }

  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(`已删除 ${tables.length} 张表，并按 ${applied.length} 个迁移重建`);

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
