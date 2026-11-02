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
});
