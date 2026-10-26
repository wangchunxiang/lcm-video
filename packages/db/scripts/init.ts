import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const host = process.env.DB_HOST ?? '127.0.0.1';
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? 'root';
const password = process.env.DB_PASSWORD ?? '';
const database = process.env.DB_NAME ?? 'lcm_video';

const sqlPath = fileURLToPath(new URL('../init.sql', import.meta.url));
const sqlText = await readFile(sqlPath, 'utf8');

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  multipleStatements: true,
  charset: 'utf8mb4',
});

try {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.query(`USE \`${database}\``);
  await conn.query(sqlText);

  const [tables] = await conn.query('SHOW TABLES');
  console.log(`数据库 ${database} 初始化完成，表数量：${(tables as unknown[]).length}`);
  for (const row of tables as Record<string, string>[]) {
    console.log(`  - ${Object.values(row)[0]}`);
  }
} finally {
  await conn.end();
}
