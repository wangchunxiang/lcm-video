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
  name: string;
  sourceId: string | null;
  sourceName: string;
}

/**
 * 线路表的「来源」只有一个来源：`lcm_play_line.source_id`（采集首次登记时写入）。
 *
 * 回归背景：这一列原本靠 `lcm_collect_source.play_from` 反查，而那个字段没有任何
 * 写入方，线上 6 条线路里 5 条来源为空；后来加的「反查 `lcm_vod_play` 兜底」
 * 让同一件事有了两条取值路径。现在归属直接记在线路表上，一条路径。
 */
describe('线路管理：来源列', () => {
  const SOURCE_NAME = 'E2E 来源列源';
  const OWNED = 'e2e-src-owned';
  const UNKNOWN = 'e2e-src-unknown';

  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
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

    sourceId = await insertId(
      'INSERT INTO lcm_collect_source (name, api_url, is_enabled) VALUES (?, ?, 1)',
      [SOURCE_NAME, 'http://e2e.example.com/api.php/provide/vod/'],
    );

    const lineId = await createLine(OWNED);
    await dataSource.query('UPDATE lcm_play_line SET source_id = ? WHERE id = ?', [sourceId, lineId]);
    await createLine(UNKNOWN);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM lcm_collect_source WHERE id = ?', [sourceId]);
    await dataSource.query('DELETE FROM lcm_play_line WHERE source_from LIKE ?', ['e2e-src-%']);
    await app.close();
  });

  it('线路表上记了源，就显示那个源站名', async () => {
    const line = findLine(await listLines(), OWNED);
    expect(line?.sourceName).toBe(SOURCE_NAME);
  });

  it('没有归属的线路来源留空，不会瞎猜', async () => {
    const line = findLine(await listLines(), UNKNOWN);
    expect(line?.sourceName).toBe('');
    expect(line?.sourceId).toBeNull();
  });

  it('后台新建线路时不带归属', async () => {
    const line = findLine(await listLines(), UNKNOWN);
    expect(line?.name).toBe('');
  });
});
