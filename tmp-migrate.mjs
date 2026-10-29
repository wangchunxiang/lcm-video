import { createDb } from './packages/db/src/client.ts';
import { looseHash, nameHash } from './packages/shared/src/vod.ts';
const { pool } = createDb({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 4 });

const [[col]] = await pool.query("SHOW COLUMNS FROM lcm_vod LIKE 'name_hash_loose'");
if (!col) {
  await pool.query("ALTER TABLE lcm_vod ADD COLUMN `name_hash_loose` CHAR(32) NOT NULL DEFAULT '' COMMENT '宽松键（再去掉标点）的 MD5，仅用于提示疑似重复' AFTER `name_hash`");
  await pool.query('ALTER TABLE lcm_vod ADD KEY `idx_name_hash_loose` (`name_hash_loose`)');
  console.log('已加列 name_hash_loose');
} else {
  console.log('列已存在');
}

const [rows] = await pool.query('SELECT id, name, name_hash, name_hash_loose FROM lcm_vod');
let strict = 0;
let loose = 0;
for (const row of rows) {
  const h = nameHash(row.name);
  const l = looseHash(row.name);
  const setStrict = h !== row.name_hash;
  const setLoose = l !== row.name_hash_loose;
  if (!setStrict && !setLoose) continue;
  await pool.query('UPDATE lcm_vod SET name_hash = ?, name_hash_loose = ? WHERE id = ?', [
    setStrict ? h : row.name_hash,
    setLoose ? l : row.name_hash_loose,
    row.id,
  ]);
  if (setStrict) strict += 1;
  if (setLoose) loose += 1;
}
console.log('总行数', rows.length, '严格键更新', strict, '宽松键更新', loose);
await pool.end();
