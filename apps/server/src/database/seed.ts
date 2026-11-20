/**
 * 把 `database/seeds/*.sql` 导入 DATABASE_URL 指向的库。
 *
 * 用法：
 *   npm run db:seed -w apps/server              # 真正执行
 *   npm run db:seed -w apps/server -- --dry-run # 只打印要执行的语句
 *
 * 种子文件是「注释 + 一条 INSERT」，按 `;` 切分后逐条执行；
 * 表里已有同主键数据时会报错，重导前先清表（或直接用 init-db 重建）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '../config/typeorm.config';
import { parseStatements } from './seed-sql';
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const dir = join(__dirname, 'seeds');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const plan = files.map((name) => ({
    name,
    statements: parseStatements(readFileSync(join(dir, name), 'utf8')),
  }));

  if (dryRun) {
    for (const item of plan) {
      console.log(`${item.name}: ${item.statements.length} 条语句`);
      for (const statement of item.statements) {
        console.log(`  ${statement.slice(0, 80).replace(/\s+/g, ' ')}…`);
      }
    }
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 未配置');
    process.exit(1);
  }

  // 种子里是纯 INSERT，建表交给迁移（`npm run db:migrate` 或应用启动）。
  const dataSource = new DataSource({ ...createDataSourceOptions(url), migrationsRun: false });
  await dataSource.initialize();

  for (const item of plan) {
    for (const statement of item.statements) {
      await dataSource.query(statement);
    }
    console.log(`已导入 ${item.name}（${item.statements.length} 条语句）`);
  }

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
