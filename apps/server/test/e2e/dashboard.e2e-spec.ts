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

interface DayPoint {
  date: string;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

interface LatestVod {
  id: string;
  name: string;
  year: number;
  collectedAt: string | null;
  updatedAt: string | null;
}

interface Summary {
  vod: { total: number; enabled: number };
  play: { total: number };
  todayLog: {
    runs: number;
    inserted: number;
    updated: number;
    skipped: number;
    ignored: number;
    failed: number;
  };
  trend: DayPoint[];
  hours: Array<{
    hour: number;
    runs: number;
    inserted: number;
    updated: number;
    skipped: number;
    ignored: number;
    failed: number;
  }>;
  categories: Array<{ name: string; count: number }>;
  lines: { total: number; items: Array<{ name: string; count: number }> };
  pending: { coverCheck: number; mergeGroups: number; orphanVods: number; failedLogs: number };
  latestVods: { total: number; items: LatestVod[] };
  latestUpdates: { total: number; items: LatestVod[] };
}

/**
 * 首页概览是「一次请求拼一屏」，最容易坏在两类地方：
 * 1）**形状**——趋势固定 7 天、热力固定 91 天、小时固定 24 格，缺数据的天要补 0，
 *    否则前端按索引取点会错位、柱状图会少一格；
 * 2）**类型**——驱动把 SUM() 返回成字符串，混进前端做除法就成了字符串拼接。
 * 这里守住形状、类型、补零，以及「线路名回退」「待处理计数口径」「全量采集不计入日统计」这几条语义。
 */
describe('后台概览 /api/admin/dashboard/summary', () => {
  const SOURCE_NAME = 'E2E 概览源';
  const LINE_REGISTERED = 'e2edash-b';
  const LINE_REGISTERED_NAME = 'E2E 概览线路';
  const LINE_UNREGISTERED = 'e2edash-a';
  const VOD_NAME = 'E2E 概览用例影片';

  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let sourceId: string;
  let vodId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function insertId(sql: string, params: unknown[]): Promise<string> {
    const result = (await dataSource.query(sql, params)) as { insertId: number | string };
    return String(result.insertId);
  }

  async function summary(): Promise<Summary> {
    const response = await request(app.getHttpServer())
      .get('/api/admin/dashboard/summary')
      .set(auth());
    const body = response.body as Envelope<Summary>;
    expect(body.code).toBe(0);
    return body.data;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    token = await loginToken(app);

    const sourceResponse = await request(app.getHttpServer())
      .post('/api/admin/collect-source')
      .set(auth())
      .send({ name: SOURCE_NAME, apiUrl: 'http://dash.example.com/api.php/provide/vod' });
    const sourceBody = sourceResponse.body as Envelope<IdRow>;
    expect(sourceBody.code).toBe(0);
    sourceId = sourceBody.data.id;

    // 永不到点的 cron：调度器不会在测试期间真的跑起来，这条任务只是给日志挂个 task_id
    await dataSource.query(
      `INSERT INTO lcm_collect_task (name, source_id, range_type, cron, is_enabled)
       VALUES (?, ?, 4, '0 0 1 1 *', 1)`,
      ['E2E 概览任务', sourceId],
    );

    vodId = await insertId(
      `INSERT INTO lcm_vod (category_id, name, status, created_at) VALUES (0, ?, 1, NOW())`,
      [VOD_NAME],
    );
    await dataSource.query(
      `INSERT INTO lcm_vod_play (vod_id, source_id, source_from, play_url) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        vodId,
        sourceId,
        LINE_REGISTERED,
        'https://dash.example.com/1.m3u8',
        vodId,
        sourceId,
        LINE_UNREGISTERED,
        'https://dash.example.com/2.m3u8',
      ],
    );
    await dataSource.query(
      'INSERT INTO lcm_play_line (source_from, source_id, name, sort, is_enabled) VALUES (?, ?, ?, 0, 1)',
      [LINE_REGISTERED, sourceId, LINE_REGISTERED_NAME],
    );

    // 今天两次运行：一次成功、一次失败；昨天一次成功。补零逻辑要看这几天
    const yesterday = new Date(Date.now() - 86_400_000);
    await dataSource.query(
      `INSERT INTO lcm_collect_task_log (source_id, task_name, range_type, status, inserted, updated, failed, started_at, finished_at)
       VALUES (?, 'E2E 概览任务', 1, 2, 30, 20, 0, ?, NOW())`,
      [sourceId, `${yesterday.toISOString().slice(0, 10)} 03:00:00`],
    );
    await dataSource.query(
      `INSERT INTO lcm_collect_task_log (source_id, task_name, range_type, status, inserted, updated, failed, started_at, finished_at)
       VALUES (?, 'E2E 概览任务', 1, 3, 0, 0, 5, NOW(), NOW())`,
      [sourceId],
    );
    await dataSource.query(
      `INSERT INTO lcm_collect_task_log (source_id, task_name, range_type, status, inserted, updated, skipped, ignored, failed, started_at, finished_at)
       VALUES (?, 'E2E 概览任务', 1, 2, 7, 3, 40, 2, 0, NOW(), NOW())`,
      [sourceId],
    );
    // 全量采集（range_type=4，手动采集一个源站）：日统计必须把它排除，
    // 否则这一跑的量会把当天柱子顶成平地起尖
    await dataSource.query(
      `INSERT INTO lcm_collect_task_log (source_id, task_name, range_type, status, inserted, updated, failed, started_at, finished_at)
       VALUES (?, 'E2E 全量采集', 4, 2, 9999, 9999, 0, NOW(), NOW())`,
      [sourceId],
    );

    await dataSource.query(
      `INSERT INTO lcm_cover_check (host, vod_count, status, sample_ok, sample_fail, message)
       VALUES ('e2edash-ok.example.com', 1, 1, 2, 0, '正常'),
              ('e2edash-bad.example.com', 1, 2, 0, 2, '失效'),
              ('e2edash-unknown.example.com', 1, 3, 0, 2, '无法验证')`,
    );
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM lcm_vod_play WHERE vod_id = ?', [vodId]);
    await dataSource.query('DELETE FROM lcm_vod WHERE id = ?', [vodId]);
    await dataSource.query('DELETE FROM lcm_play_line WHERE source_from IN (?, ?)', [
      LINE_REGISTERED,
      LINE_UNREGISTERED,
    ]);
    await dataSource.query('DELETE FROM lcm_cover_check WHERE host LIKE ?', ['e2edash-%']);
    await dataSource.query('DELETE FROM lcm_collect_task_log WHERE source_id = ?', [sourceId]);
    await dataSource.query('DELETE FROM lcm_collect_task WHERE source_id = ?', [sourceId]);
    await app.close();
  });

  it('趋势 8 点（今天往前推 7 天 + 今天）、小时 24 格，且缺数据的天补 0', async () => {
    const data = await summary();
    expect(data.trend).toHaveLength(8);
    expect(data.hours).toHaveLength(24);

    // 最后一天是今天，日期连续（补零不能跳格）
    const dates = data.trend.map((item) => item.date);
    expect(new Set(dates).size).toBe(8);

    // 昨天的 30 部要落在倒数第二格，其余天补 0
    const last = data.trend[data.trend.length - 1];
    const before = data.trend[data.trend.length - 2];
    expect(before?.inserted).toBeGreaterThanOrEqual(30);
    // 今天的增量采集是 7，全量采集的 9999 不能混进来
    expect(last?.inserted).toBe(7);
    expect(data.trend[0]?.inserted).toBe(0);
    // 跳过/忽略也是独立的维度，不能被并进其他计数
    expect(last?.skipped).toBe(40);
    expect(last?.ignored).toBe(2);
  });

  it('聚合值都是数字，不是驱动返回的字符串', async () => {
    const data = await summary();
    for (const item of [data.trend[data.trend.length - 1], data.hours[0]]) {
      expect(typeof item?.inserted).toBe('number');
      expect(typeof item?.updated).toBe('number');
      expect(typeof item?.skipped).toBe('number');
      expect(typeof item?.ignored).toBe('number');
      expect(typeof item?.failed).toBe('number');
    }
    expect(typeof data.todayLog.inserted).toBe('number');
    expect(typeof data.todayLog.skipped).toBe('number');
    expect(typeof data.play.total).toBe('number');
    expect(data.lines.items.every((item) => typeof item.count === 'number')).toBe(true);
  });

  it('今日合计与小时分布对得上', async () => {
    const data = await summary();
    const hourRuns = data.hours.reduce((sum, item) => sum + item.runs, 0);
    expect(hourRuns).toBe(data.todayLog.runs);
    expect(data.todayLog.failed).toBeGreaterThanOrEqual(5);
    // 今日入库同样排除全量采集（那一条写的是 9999）
    expect(data.todayLog.inserted).toBe(7);
    expect(data.todayLog.updated).toBe(3);
    expect(data.todayLog.skipped).toBe(40);
    expect(data.todayLog.ignored).toBe(2);
  });

  it('线路分布：注册过的用显示名，没注册的回退到线路标识', async () => {
    const data = await summary();
    const names = data.lines.items.map((item) => item.name);
    expect(names).toContain(LINE_REGISTERED_NAME);
    expect(names).toContain(LINE_UNREGISTERED);
    expect(data.lines.total).toBeGreaterThanOrEqual(2);
  });

  it('待处理：图片只数「失效 / 无法验证」，不含正常与未检查', async () => {
    const data = await summary();
    expect(data.pending.coverCheck).toBeGreaterThanOrEqual(2);
    expect(data.pending.failedLogs).toBeGreaterThanOrEqual(1);
  });

  it('今日入库按 id 倒序、今日更新按 updated_at 倒序，且只含当天', async () => {
    const data = await summary();

    expect(data.latestVods.items.length).toBeGreaterThan(0);
    expect(data.latestVods.items.length).toBeLessThanOrEqual(50);
    expect(data.latestVods.total).toBeGreaterThanOrEqual(data.latestVods.items.length);
    const ids = data.latestVods.items.map((item) => Number(item.id));
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    const today = new Date().toDateString();
    for (const item of data.latestVods.items) {
      expect(new Date(item.collectedAt ?? 0).toDateString()).toBe(today);
    }

    expect(data.latestUpdates.items.length).toBeGreaterThan(0);
    const times = data.latestUpdates.items.map((item) => new Date(item.updatedAt ?? 0).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const item of data.latestUpdates.items) {
      expect(new Date(item.updatedAt ?? 0).toDateString()).toBe(today);
    }
  });

});
