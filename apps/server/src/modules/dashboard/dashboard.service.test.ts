import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

/** 全量的范围类型值：`LOG_SUMS` 里要把它排除在增量之外 */
const FULL_RANGE = 4;

interface QueryCall {
  sql: string;
  params: unknown[];
}

/**
 * 假 DataSource：只认 `collectSeries` 会发的两条 SQL。
 * `dayRows` 给按小时那条用，`dateRows` 给按天那条用；每次都把入参记下来，
 * 参数顺序错了（占位符在 SELECT 里、条件在最后）这里能立刻看出来。
 */
function fakeDataSource(dayRows: Array<Record<string, string>>, dateRows: Array<Record<string, string>>) {
  const calls: QueryCall[] = [];
  const dataSource = {
    query: async (sql: string, params: unknown[] = []): Promise<unknown> => {
      calls.push({ sql, params });
      return sql.includes('HOUR(') ? dayRows : dateRows;
    },
  } as unknown as DataSource;
  return { dataSource, calls };
}

function hourRow(hour: number, runs: number, inserted: number): Record<string, string> {
  return { h: String(hour), runs: String(runs), inserted: String(inserted), updated: '0', skipped: '0', ignored: '0', failed: '0' };
}

describe('DashboardService.collectSeries', () => {
  beforeEach(() => {
    // 固定成周四：本周一 = 11-23，本月 1 号 = 11-01，都是自然周期的边界
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T10:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('本日按小时切 24 格，只有当前那格算进行中', async () => {
    const { dataSource } = fakeDataSource([hourRow(9, 2, 7), hourRow(10, 1, 3)], []);
    const series = await new DashboardService(dataSource).collectSeries('day');

    expect(series.unit).toBe('hour');
    expect(series.buckets).toHaveLength(24);
    expect(series.buckets[0]?.key).toBe('00:00');
    expect(series.buckets[23]?.key).toBe('23:00');
    // 没有记录的时段补 0，不能少格（前端按索引取点）
    expect(series.buckets[0]).toMatchObject({ runs: 0, inserted: 0, partial: false });
    expect(series.buckets[9]).toMatchObject({ runs: 2, inserted: 7, partial: false });
    expect(series.buckets[10]).toMatchObject({ runs: 1, inserted: 3, partial: true });
    expect(series.totals).toMatchObject({ runs: 3, inserted: 10 });
  });

  it('本周从本周一开始，到今天就停，不把后几天补成 0', async () => {
    const { dataSource, calls } = fakeDataSource([], [{ date: '2026-11-25', runs: '4', inserted: '9', updated: '1', skipped: '2', ignored: '0', failed: '0' }]);
    const series = await new DashboardService(dataSource).collectSeries('week');

    expect(series.unit).toBe('day');
    expect(series.buckets.map((item) => item.key)).toEqual(['11-23', '11-24', '11-25', '11-26']);
    expect(series.buckets[2]).toMatchObject({ runs: 4, inserted: 9 });
    expect(series.buckets.at(-1)).toMatchObject({ key: '11-26', partial: true });

    // 查询起点也是本周一，不是「今天减 7 天」
    const call = calls[0];
    expect(call?.params.at(-1)).toBe('2026-11-23');
    // 5 个 exclude 参数在前、起点在最后：反过来会把 `started_at >= '2026-11-01'` 当成范围类型
    expect(call?.params.slice(0, 5)).toEqual([FULL_RANGE, FULL_RANGE, FULL_RANGE, FULL_RANGE, FULL_RANGE]);
  });

  it('本月从 1 号开始，缺的天补 0', async () => {
    const { dataSource } = fakeDataSource([], [{ date: '2026-11-18', runs: '1', inserted: '101', updated: '0', skipped: '0', ignored: '0', failed: '0' }]);
    const series = await new DashboardService(dataSource).collectSeries('month');

    expect(series.buckets).toHaveLength(26);
    expect(series.buckets[0]?.key).toBe('11-01');
    expect(series.buckets.at(-1)?.key).toBe('11-26');
    expect(series.buckets[17]).toMatchObject({ key: '11-18', runs: 1, inserted: 101 });
    expect(series.buckets[0]).toMatchObject({ runs: 0, inserted: 0, partial: false });
    expect(series.totals).toMatchObject({ runs: 1, inserted: 101 });
  });

  it('本月 1 号当天只有一格', async () => {
    vi.setSystemTime(new Date('2026-12-01T08:00:00'));
    const { dataSource } = fakeDataSource([], []);
    const series = await new DashboardService(dataSource).collectSeries('month');

    expect(series.buckets.map((item) => item.key)).toEqual(['12-01']);
    expect(series.buckets[0]?.partial).toBe(true);
  });

  it('周日仍属于当周：本周一不是「今天」而是六天前', async () => {
    // 2026-11-29 是周日
    vi.setSystemTime(new Date('2026-11-29T23:10:00'));
    const { dataSource } = fakeDataSource([], []);
    const series = await new DashboardService(dataSource).collectSeries('week');

    expect(series.buckets.map((item) => item.key)).toEqual(['11-23', '11-24', '11-25', '11-26', '11-27', '11-28', '11-29']);
  });
});
