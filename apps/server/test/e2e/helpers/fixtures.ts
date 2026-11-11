import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { hashPassword } from '../../../src/common/security/password';

/** 测试账号：登录用例直接用它，避免依赖真实种子里那个不知道明文的哈希。 */
export const ADMIN = { username: 'admin', password: 'admin123' } as const;

export interface Fixtures {
  parentCategoryId: string;
  categoryId: string;
  categoryAlias: string;
  vodId: string;
}

async function insertId(dataSource: DataSource, sql: string, params: unknown[]): Promise<string> {
  const result = (await dataSource.query(sql, params)) as { insertId: number | string };
  return String(result.insertId);
}

/**
 * 门户接口需要真实数据才能断言，这里插入最小一组：账号、两级分类、一部影片、一条线路。
 * 全部按唯一键先查后插，重复执行不会产生多份。
 */
export async function seedFixtures(app: INestApplication): Promise<Fixtures> {
  const dataSource = app.get(DataSource);

  await dataSource.query(
    `INSERT INTO lcm_admin_user (username, password, nickname, is_enabled, password_version)
     VALUES (?, ?, '管理员', 1, 0)
     ON DUPLICATE KEY UPDATE password = VALUES(password)`,
    [ADMIN.username, hashPassword(ADMIN.password)],
  );

  const parentCategoryId = await ensureCategory(dataSource, {
    pid: '0',
    name: 'E2E 电影',
    alias: 'e2e-movie',
  });
  const categoryId = await ensureCategory(dataSource, {
    pid: parentCategoryId,
    name: 'E2E 动作',
    alias: 'e2e-action',
  });

  const vodName = 'E2E 测试影片';
  const hash = createHash('md5').update(vodName).digest('hex');
  const [existingVod] = await dataSource.query<Array<{ id: string }>>(
    'SELECT id FROM lcm_vod WHERE name = ? LIMIT 1',
    [vodName],
  );
  const vodId =
    existingVod?.id ??
    (await insertId(
      dataSource,
      `INSERT INTO lcm_vod
         (category_id, category_pid, name, name_hash, name_hash_loose, status, year, episode_count, remarks, collected_at)
       VALUES (?, ?, ?, ?, ?, 1, 2024, 1, '更新至1集', NOW())`,
      [categoryId, parentCategoryId, vodName, hash, hash],
    ));

  const [existingPlay] = await dataSource.query<Array<{ id: string }>>(
    'SELECT id FROM lcm_vod_play WHERE vod_id = ? LIMIT 1',
    [vodId],
  );
  if (existingPlay === undefined) {
    await dataSource.query(
      `INSERT INTO lcm_vod_play (vod_id, source_id, source_from, source_vod_id, collected_at, play_url)
       VALUES (?, NULL, 'e2e', 'e2e-1', NOW(), '第1集$http://example.com/1.m3u8')`,
      [vodId],
    );
  }

  return { parentCategoryId, categoryId, categoryAlias: 'e2e-action', vodId };
}

async function ensureCategory(
  dataSource: DataSource,
  input: { pid: string; name: string; alias: string },
): Promise<string> {
  const [existing] = await dataSource.query<Array<{ id: string }>>(
    'SELECT id FROM lcm_category WHERE alias = ? LIMIT 1',
    [input.alias],
  );
  if (existing !== undefined) return existing.id;
  return insertId(
    dataSource,
    'INSERT INTO lcm_category (pid, name, alias, match_names, sort, is_show) VALUES (?, ?, ?, ?, 1, 1)',
    [input.pid, input.name, input.alias, ''],
  );
}
