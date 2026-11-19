import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import { loginToken } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface IdRow {
  id: string;
}

interface LineRow {
  id: string;
  sourceFrom: string;
  sourceName: string;
}

/**
 * 线路表的「来源」列有两条数据来源，缺一条就会显示空白：
 * 1. `lcm_collect_source.play_from`（采集时回写的登记值）；
 * 2. 反查 `lcm_vod_play.source_id`（老数据的源上没登记，用实际持有该线路影片最多的源兜底）。
 *
 * 回归背景：线上 6 条线路里 5 条来源为空，因为 `play_from` 从来没有人写过。
 */
describe('线路管理：来源列', () => {
  const SOURCE_NAME = 'E2E 来源列源';
  const REGISTERED = 'e2e-src-registered';
  const OWNED = 'e2e-src-owned';
  const UNKNOWN = 'e2e-src-unknown';

  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let categoryId: string;
  let categoryPid: string;
  let sourceId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function insertId(sql: string, params: unknown[]): Promise<string> {
    const result = (await dataSource.query(sql, params)) as { insertId: number | string };
    return String(result.insertId);
  }

  async function createLine(sourceFrom: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/admin/play-line')
      .set(auth())
      .send({ sourceFrom, sort: 0 });
    const body = response.body as Envelope<IdRow>;
    expect(body.code).toBe(0);
    return body.data.id;
  }

  async function listLines(): Promise<LineRow[]> {
    const response = await request(app.getHttpServer())
      .get('/api/admin/play-line')
      .query({ take: 100 })
      .set(auth());
    const body = response.body as Envelope<{ items: LineRow[]; total: number }>;
    expect(body.code).toBe(0);
    return body.data.items;
  }

  const findLine = (rows: LineRow[], sourceFrom: string): LineRow | undefined =>
    rows.find((row) => row.sourceFrom === sourceFrom);

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    token = await loginToken(app);

    const rows = await dataSource.query<Array<{ id: string; pid: string }>>(
      "SELECT id, pid FROM lcm_category WHERE pid <> '0' ORDER BY id LIMIT 1",
    );
    const category = rows[0];
    if (!category) throw new Error('测试库没有二级分类');
    categoryId = category.id;
    categoryPid = category.pid;

    sourceId = await insertId(
      'INSERT INTO lcm_collect_source (name, api_url, play_from, is_enabled) VALUES (?, ?, ?, 1)',
      [SOURCE_NAME, 'http://e2e.example.com/api.php/provide/vod/', ''],
    );

    const lineId = await createLine(OWNED);
    const vodId = await insertId(
      `INSERT INTO lcm_vod (name, name_hash, name_hash_loose, category_id, category_pid, status, collected_at)
       VALUES (?, ?, ?, ?, ?, 1, NOW())`,
      ['E2E 来源列影片', 'e2e-play-line-1', 'e2e-play-line-1', categoryId, categoryPid],
    );
    await dataSource.query(
      `INSERT INTO lcm_vod_play (vod_id, source_id, source_from, source_vod_id, play_url, collected_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [vodId, sourceId, OWNED, `e2e-${vodId}`, 'https://e2e.example.com/1/index.m3u8'],
    );
    await createLine(REGISTERED);
    await dataSource.query('UPDATE lcm_collect_source SET play_from = ? WHERE id = ?', [REGISTERED, sourceId]);
    await createLine(UNKNOWN);
    expect(lineId).not.toBe('');
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM lcm_vod_play WHERE source_id = ?', [sourceId]);
    await dataSource.query("DELETE FROM lcm_vod WHERE name_hash = 'e2e-play-line-1'");
    await dataSource.query('DELETE FROM lcm_collect_source WHERE id = ?', [sourceId]);
    await dataSource.query('DELETE FROM lcm_play_line WHERE source_from LIKE ?', ['e2e-src-%']);
    await app.close();
  });

  it('源上登记的 play_from 能反查到来源', async () => {
    const line = findLine(await listLines(), REGISTERED);
    expect(line?.sourceName).toBe(SOURCE_NAME);
  });

  it('源上没登记时，用实际持有该线路影片的源兜底', async () => {
    const line = findLine(await listLines(), OWNED);
    expect(line?.sourceName).toBe(SOURCE_NAME);
  });

  it('既没登记也没人采集过的线路留空，不会瞎猜', async () => {
    const line = findLine(await listLines(), UNKNOWN);
    expect(line?.sourceName).toBe('');
  });
});
