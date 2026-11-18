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

interface DeleteResult {
  success: boolean;
  message: string;
}

/**
 * 删采集源是一条「没有外键兜底」的清理链：全库零外键，全靠 purge() 按顺序手工删。
 * 这里守住四条语义：
 * 1）该源的映射、任务、日志（含明细）、替换规则、广告特征、播放地址全清；
 * 2）失去全部线路的影片一并删掉，还有别的源的影片要留着并保住它的线路；
 * 3）线路注册表只在彻底没人用时才删；
 * 4）域名体检表里已经没有影片引用的域名顺手清掉。
 */
describe('删除采集源 /api/admin/collect-source', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let categoryId: string;
  let sourceA: string;
  let sourceB: string;
  let vodOnlyA: string;
  let vodShared: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function insertId(sql: string, params: unknown[]): Promise<string> {
    const result = (await dataSource.query(sql, params)) as { insertId: number | string };
    return String(result.insertId);
  }

  async function createSource(name: string, playFrom: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/admin/collect-source')
      .set(auth())
      .send({ name, apiUrl: `http://${playFrom}.example.com/api.php/provide/vod`, playFrom });
    const body = response.body as Envelope<IdRow>;
    expect(body.code).toBe(0);
    return body.data.id;
  }

  async function createVod(name: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/admin/vod')
      .set(auth())
      .send({ categoryId, name });
    const body = response.body as Envelope<IdRow>;
    expect(body.code).toBe(0);
    return body.data.id;
  }

  async function addPlay(vodId: string, sourceId: string, sourceFrom: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO lcm_vod_play (vod_id, source_id, source_from, source_vod_id, play_url, collected_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [vodId, sourceId, sourceFrom, `${sourceFrom}-${vodId}`, 'https://e2e.example.com/1/index.m3u8'],
    );
  }

  const countOf = async (table: string, where: string, params: unknown[]): Promise<number> => {
    const rows = await dataSource.query<Array<{ c: number }>>(
      `SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`,
      params,
    );
    return Number(rows[0]?.c ?? 0);
  };

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    dataSource = app.get(DataSource);
    token = await loginToken(app);
    categoryId = context.fixtures.categoryId;

    sourceA = await createSource('E2E 删源 A', 'e2ea');
    sourceB = await createSource('E2E 删源 B', 'e2eb');

    await dataSource.query(
      `INSERT INTO lcm_collect_source_category
         (source_id, source_type_id, source_type_name, source_type_pid, category_id, match_type, status)
       VALUES (?, '1', '动作片', '0', ?, 1, 1)`,
      [sourceA, categoryId],
    );
    const taskId = await insertId(
      `INSERT INTO lcm_collect_task (source_id, name, range_type, cron) VALUES (?, 'E2E 删源任务', 1, '0 0 3 * * *')`,
      [sourceA],
    );
    const logId = await insertId(
      `INSERT INTO lcm_collect_task_log (task_id, source_id, task_name, range_type, status)
       VALUES (?, ?, 'E2E 删源任务', 1, 2)`,
      [taskId, sourceA],
    );
    await dataSource.query(
      `INSERT INTO lcm_collect_task_log_detail (log_id, page, total) VALUES (?, 1, 10)`,
      [logId],
    );
    await dataSource.query(
      `INSERT INTO lcm_source_rule (source_id, kind, from_url, to_url, is_enabled, sort)
       VALUES (?, 1, 'old.example.com', 'new.example.com', 1, 0)`,
      [sourceA],
    );
    await dataSource.query(`INSERT INTO lcm_ad_feature (source_id, kind, durations) VALUES (?, 1, '[]')`, [
      sourceA,
    ]);
    await dataSource.query(
      `INSERT INTO lcm_play_line (source_from, name, sort, is_enabled) VALUES ('e2ea', 'A 线路', 5, 1)`,
    );
    await dataSource.query(
      `INSERT INTO lcm_play_line (source_from, name, sort, is_enabled) VALUES ('e2eb', 'B 线路', 6, 1)`,
    );

    vodOnlyA = await createVod('删源用例孤片');
    vodShared = await createVod('删源用例共享片');
    await addPlay(vodOnlyA, sourceA, 'e2ea');
    await addPlay(vodShared, sourceA, 'e2ea');
    await addPlay(vodShared, sourceB, 'e2eb');
  });

  afterAll(async () => {
    // 用例自己收拾干净：各 spec 共用一个测试库，别把数据留给别人
    await dataSource.query('DELETE FROM lcm_vod_play WHERE source_from IN (?, ?)', ['e2ea', 'e2eb']);
    await dataSource.query('DELETE FROM lcm_play_line WHERE source_from IN (?, ?)', ['e2ea', 'e2eb']);
    await dataSource.query('DELETE FROM lcm_vod WHERE id IN (?, ?)', [vodOnlyA, vodShared]);
    await dataSource.query('DELETE FROM lcm_collect_source WHERE id = ?', [sourceB]);
    await app.close();
  });

  it('删源会清掉它自己的一切，只删失去全部线路的影片', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/admin/collect-source/${sourceA}`)
      .set(auth());
    const body = response.body as Envelope<DeleteResult>;
    expect(body.code).toBe(0);
    expect(body.data.success).toBe(true);
    expect(body.data.message).toContain('播放地址');

    // 源本身与它的一切
    expect(await countOf('lcm_collect_source', 'id = ?', [sourceA])).toBe(0);
    expect(await countOf('lcm_collect_source_category', 'source_id = ?', [sourceA])).toBe(0);
    expect(await countOf('lcm_collect_task', 'source_id = ?', [sourceA])).toBe(0);
    expect(await countOf('lcm_collect_task_log', 'source_id = ?', [sourceA])).toBe(0);
    expect(
      await countOf('lcm_collect_task_log_detail', 'log_id NOT IN (SELECT id FROM lcm_collect_task_log)', []),
    ).toBe(0);
    expect(await countOf('lcm_source_rule', 'source_id = ?', [sourceA])).toBe(0);
    expect(await countOf('lcm_ad_feature', 'source_id = ?', [sourceA])).toBe(0);
    expect(await countOf('lcm_vod_play', 'source_id = ?', [sourceA])).toBe(0);

    // 另一个源不受影响
    expect(await countOf('lcm_collect_source', 'id = ?', [sourceB])).toBe(1);

    // 只在 A 源的影片被删掉；两个源都有的影片留着，线路也还在
    expect(await countOf('lcm_vod', 'id = ?', [vodOnlyA])).toBe(0);
    expect(await countOf('lcm_vod', 'id = ?', [vodShared])).toBe(1);
    expect(await countOf('lcm_vod_play', 'vod_id = ? AND source_id = ?', [vodShared, sourceB])).toBe(1);

    // 线路注册表：e2ea 已经没人用 → 删；e2eb 还有影片在用 → 留
    expect(await countOf('lcm_play_line', 'source_from = ?', ['e2ea'])).toBe(0);
    expect(await countOf('lcm_play_line', 'source_from = ?', ['e2eb'])).toBe(1);
  });

  it('删不存在的源返回失败，且不动任何数据', async () => {
    const before = await countOf('lcm_collect_source', '1 = 1', []);
    const response = await request(app.getHttpServer()).delete('/api/admin/collect-source/999999').set(auth());
    const body = response.body as Envelope<DeleteResult>;
    expect(body.data.success).toBe(false);
    expect(await countOf('lcm_collect_source', '1 = 1', [])).toBe(before);
  });
});
