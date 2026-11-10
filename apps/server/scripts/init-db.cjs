/**
 * 从实体重建 `lcm-video` 库，并生成 baseline 迁移文件。
 *
 * 用法（先 `npm run build -w apps/server`）：
 *   node --env-file=.env apps/server/scripts/init-db.cjs
 *
 * 做的事：
 * 1. 删掉库里所有表（只用于全新库/本地开发，千万别对线上跑）
 * 2. 用 TypeORM 的 schema builder 按实体建表，同时把建表 SQL 落成迁移文件
 * 3. 追加手写约束 `ck_status_mapped`
 */
const fs = require('node:fs');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { createDataSourceOptions } = require('../dist/database/options.js');

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('DATABASE_URL 未配置');
  process.exit(1);
}

async function main() {
  const dataSource = new DataSource({ ...createDataSourceOptions(URL), synchronize: false });
  await dataSource.initialize();

  const existing = await dataSource.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  for (const row of existing) {
    await dataSource.query(`DROP TABLE IF EXISTS \`${row.name}\``);
  }
  console.log(`已清空 ${existing.length} 张表`);

  const log = await dataSource.driver.createSchemaBuilder().log();
  const queries = log.upQueries.map((item) => item.query);

  const CHECK = 'ALTER TABLE `lcm_collect_source_category` ADD CONSTRAINT `ck_status_mapped` CHECK ((`status` = 1) = (`category_id` > 0))';
  for (const query of queries) {
    await dataSource.query(query);
  }
  await dataSource.query(CHECK);
  console.log(`已创建 ${queries.length} 张表 + 1 个 CHECK 约束`);

  const stamp = Date.now();
  const className = `Init${stamp}`;
  const upBody = [...queries, CHECK].map((q) => `    await queryRunner.query(${JSON.stringify(q)});`).join('\n');
  const downBody = existing
    .map((row) => `    await queryRunner.query(${JSON.stringify(`DROP TABLE IF EXISTS \`${row.name}\``)});`)
    .join('\n');

  const file = `import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * baseline：按实体从零建表（含 \`ck_status_mapped\` 约束）。
 * 由 apps/server/scripts/init-db.cjs 生成，不要手改。
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

  const dir = path.join(__dirname, '..', 'src', 'database', 'migrations');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${stamp}-init.ts`);
  fs.writeFileSync(target, file, 'utf8');
  console.log(`迁移文件已写入 ${path.relative(process.cwd(), target)}`);

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
