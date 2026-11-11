import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '../config/typeorm.config';

/**
 * 执行未应用的迁移。应用启动时也会自动跑（`migrationsRun: true`），
 * 这个入口给 CI / 部署脚本用，能在启动前把结构准备好并打印执行了哪些迁移。
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 未配置');
    process.exit(1);
  }

  const dataSource = new DataSource({ ...createDataSourceOptions(url), migrationsRun: false });
  await dataSource.initialize();

  const applied = await dataSource.runMigrations({ transaction: 'each' });
  if (applied.length === 0) {
    console.log('没有待执行的迁移');
  } else {
    for (const migration of applied) {
      console.log(`已执行 ${migration.name}`);
    }
  }

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
