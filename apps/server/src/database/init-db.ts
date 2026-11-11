/**
 * 从实体重建 `lcm-video` 库，并生成 baseline 迁移文件。
 *
 * 用法（tsx 直接跑 TS，不需要先 build）：
 *   npm run db:init -w apps/server -- --force
 *
 * 做的事：
 * 1. 删掉库里所有表（只用于全新库/本地开发，千万别对线上跑）
 * 2. 用 TypeORM 的 schema builder 按实体建表，同时把建表 SQL 落成迁移文件
 * 3. 追加手写约束 `ck_status_mapped`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '../config/typeorm.config';

const CHECK =
  'ALTER TABLE `lcm_collect_source_category` ADD CONSTRAINT `ck_status_mapped` CHECK ((`status` = 1) = (`category_id` > 0))';

interface TableRow {
  name: string;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--force')) {
    console.error('这会 DROP 掉 DATABASE_URL 指向库里所有表；确认要重建请加 --force');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 未配置');
    process.exit(1);
  }

  const dataSource = new DataSource({ ...createDataSourceOptions(url), synchronize: false });
  await dataSource.initialize();

  const existing = await dataSource.query<TableRow[]>(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  for (const row of existing) {
    await dataSource.query(`DROP TABLE IF EXISTS \`${row.name}\``);
  }
  console.log(`已清空 ${existing.length} 张表`);

  const log = await dataSource.driver.createSchemaBuilder().log();
  const queries = log.upQueries.map((item) => item.query);

  for (const query of queries) {
    await dataSource.query(query);
  }
  await dataSource.query(CHECK);
  console.log(`已创建 ${queries.length} 张表 + 1 个 CHECK 约束`);

  const stamp = Date.now();
  const className = `Init${stamp}`;
  const upBody = [...queries, CHECK]
    .map((q) => `    await queryRunner.query(${JSON.stringify(q)});`)
    .join('\n');
  const downBody = existing
    .map((row) => `    await queryRunner.query(${JSON.stringify(`DROP TABLE IF EXISTS \`${row.name}\``)});`)
    .join('\n');

  const file = `import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * baseline：按实体从零建表（含 \`ck_status_mapped\` 约束）。
 * 由 apps/server/src/database/init-db.ts 生成，不要手改。
 */
export class ${className} implements MigrationInterface {
  name = '${className}';

  async up(queryRunner: QueryRunner): Promise<void> {
${upBody}
  }

  async down(queryRunner: QueryRunner): Promise<void> {
${downBody}
  }
}
`;

  const dir = join(__dirname, 'migrations');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${stamp}-init.ts`);
  writeFileSync(target, file, 'utf8');
  console.log(`迁移文件已写入 ${relative(process.cwd(), target)}`);

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
