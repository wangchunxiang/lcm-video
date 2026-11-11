import { createConnection } from 'mysql2/promise';
import { assertTestDatabase, testDatabaseUrl } from './test-env';

/**
 * 每次跑 e2e 前把测试库恢复成空库：建库（不存在时）+ DROP 全部表。
 * 建表交给应用启动时的 `migrationsRun`，这样测试跑的就是迁移产出的真实结构。
 *
 * 这里只用 mysql2，不引 TypeORM / src 下的模块：globalSetup 由 vitest 在主线程里加载，
 * 不在 vite 的转译管线内，引项目内 TS 很容易踩到 Node 原生解析的坑。
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  assertTestDatabase(url);

  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  const connection = await createConnection({
    host: parsed.hostname,
    port: Number(parsed.port === '' ? 3306 : parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${database}\``);
    const [rows] = await connection.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    const tables = rows as Array<{ name: string }>;
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of tables) {
      await connection.query(`DROP TABLE IF EXISTS \`${row.name}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await connection.end();
  }
}
