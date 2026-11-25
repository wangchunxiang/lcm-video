import { describe, expect, it } from 'vitest';
import { describeCron, isValidCron, matchCron, nextRunAt, parseCron } from './cron.ts';

const at = (iso: string): Date => new Date(iso);

describe('isValidCron', () => {
  it('合法表达式返回 null', () => {
    expect(isValidCron('*/15 9-17 * * 1-5')).toBeNull();
    expect(isValidCron('0 8 * * *')).toBeNull();
  });

  it('越界与段数不足报错', () => {
    expect(isValidCron('61 * * * *')).toContain('分钟');
    expect(isValidCron('0 8 * *')).not.toBeNull();
  });
});

describe('parseCron', () => {
  it('解析区间与步长', () => {
    const parsed = parseCron('*/15 9-17 * * 1-5');
    expect(typeof parsed).not.toBe('string');
    if (typeof parsed === 'string') return;
    expect([...parsed.minute]).toEqual([0, 15, 30, 45]);
    expect(parsed.hour.size).toBe(9);
    expect(parsed.weekRestricted).toBe(true);
  });
});

describe('matchCron', () => {
  it('按分钟匹配', () => {
    expect(matchCron('0 8 * * *', at('2026-11-02T08:00:00+08:00'))).toBe(true);
    expect(matchCron('0 8 * * *', at('2026-11-02T08:01:00+08:00'))).toBe(false);
  });

  it('按星期匹配（周一=1）', () => {
    expect(matchCron('0 8 * * 1', at('2026-11-02T08:00:00+08:00'))).toBe(true);
    expect(matchCron('0 8 * * 2', at('2026-11-02T08:00:00+08:00'))).toBe(false);
  });
});

describe('nextRunAt', () => {
  it('返回下一次执行时间', () => {
    const next = nextRunAt('0 8 * * *', at('2026-11-02T07:00:00+08:00'));
    expect(next?.toISOString()).toBe(at('2026-11-02T08:00:00+08:00').toISOString());
  });

  it('当天已过则顺延到次日', () => {
    const next = nextRunAt('0 8 * * *', at('2026-11-02T09:00:00+08:00'));
    expect(next?.toISOString()).toBe(at('2026-11-03T08:00:00+08:00').toISOString());
  });

  it('表达式非法返回 null', () => {
    expect(nextRunAt('bad cron', new Date())).toBeNull();
  });
});

describe('describeCron', () => {
  it('返回可读描述', () => {
    expect(describeCron('0 8 * * *')).toContain('08:00');
  });

  it('按星期、按月、步长都有中文描述', () => {
    expect(describeCron('0 8 * * 1,3,5')).toBe('每周一、周三、周五 08:00');
    expect(describeCron('0 8 1 * *')).toBe('每月 1 号 08:00');
    expect(describeCron('0 8 1 6 *')).toBe('每年 6 月的 1 号 08:00');
    expect(describeCron('*/30 * * * *')).toBe('每 30 分钟');
    expect(describeCron('0 */2 * * *')).toBe('每 2 小时');
    // 多个小时段的复杂式识别不了，原样返回而不是瞎猜
    expect(describeCron('0 8,20 * * *')).toBe('0 8,20 * * *');
  });
});

describe('日与周同时受限', () => {
  it('任一命中即触发（与 Vixie cron 一致）', () => {
    // 2026-11-02 是周一、但不是 1 号：周命中
    expect(matchCron('0 8 1 * 1', at('2026-11-02T08:00:00+08:00'))).toBe(true);
    // 2026-12-01 是周二、但正好 1 号：日命中
    expect(matchCron('0 8 1 * 1', at('2026-12-01T08:00:00+08:00'))).toBe(true);
    // 2026-11-03 是周二、也不是 1 号：都不命中
    expect(matchCron('0 8 1 * 1', at('2026-11-03T08:00:00+08:00'))).toBe(false);
  });

  it('nextRunAt 也按「任一命中」推下一次', () => {
    // 2026-11-03（周二）之后的下一次：11-09 周一
    const next = nextRunAt('0 8 1 * 1', at('2026-11-03T09:00:00+08:00'));
    expect(next?.toISOString()).toBe(at('2026-11-09T08:00:00+08:00').toISOString());
  });
});

describe('周日写法归一', () => {
  it('周字段写 7 等价于 0', () => {
    // 2026-11-08 是周日
    expect(matchCron('0 8 * * 7', at('2026-11-08T08:00:00+08:00'))).toBe(true);
    expect(matchCron('0 8 * * 0', at('2026-11-08T08:00:00+08:00'))).toBe(true);
  });
});
