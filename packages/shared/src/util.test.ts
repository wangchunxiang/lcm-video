import { describe, expect, it } from 'vitest';
import { formatCollectSummary, normalizeCollectMessage } from './util.ts';

const counters = { total: 100, inserted: 10, updated: 20, skipped: 30, ignored: 5, failed: 2 };

describe('formatCollectSummary', () => {
  it('一行展示，字段用竖线分隔', () => {
    expect(formatCollectSummary(counters)).toBe('100条：新增10|更新20|跳过30|忽略5|失败2');
  });

  it('零值也保留字段，便于横向对比', () => {
    expect(formatCollectSummary({ total: 0, inserted: 0, updated: 0, skipped: 0, ignored: 0, failed: 0 })).toBe(
      '0条：新增0|更新0|跳过0|忽略0|失败0',
    );
  });
});

describe('normalizeCollectMessage', () => {
  it('把历史格式换成紧凑格式', () => {
    expect(normalizeCollectMessage('共 100 条：新增 10、更新 20、跳过 30、忽略 5、失败 2')).toBe(
      '100条：新增10|更新20|跳过30|忽略5|失败2',
    );
  });

  it('保留前后文字', () => {
    expect(
      normalizeCollectMessage('连续 3 页请求失败：HTTP 500（共 100 条：新增 10、更新 20、跳过 30、忽略 5、失败 2）'),
    ).toBe('连续 3 页请求失败：HTTP 500（100条：新增10|更新20|跳过30|忽略5|失败2）');
  });

  it('其他说明原样返回', () => {
    expect(normalizeCollectMessage('正在执行')).toBe('正在执行');
    expect(normalizeCollectMessage('已取消')).toBe('已取消');
  });
});
