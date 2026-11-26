import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatencyLine } from './latency';
import { latencySnapshot, recordLatency, resetLatency, startLatencyLog } from './latency';

/** 唯一一行统计；没有就当作断言失败（避免在测试里到处写非空断言） */
function onlyLine(): LatencyLine {
  const [line] = latencySnapshot();
  if (line === undefined) throw new Error('没有任何统计行');
  return line;
}

describe('recordLatency / latencySnapshot', () => {
  beforeEach(() => resetLatency());

  it('按 key 分开统计，count 是真实次数（可超过环形缓冲长度）', () => {
    for (let i = 0; i < 40; i += 1) recordLatency('http GET /a', i);
    recordLatency('upstream x.com', 5);
    const byKey = new Map(latencySnapshot().map((line) => [line.key, line]));
    expect(byKey.get('http GET /a')?.count).toBe(40);
    expect(byKey.get('upstream x.com')?.count).toBe(1);
  });

  it('样本不足 20 条不报 p95（p95 为 0），但 max 照报', () => {
    recordLatency('k', 12);
    recordLatency('k', 90);
    const line = onlyLine();
    expect(line.p95).toBe(0);
    expect(line.max).toBe(90);
  });

  it('ok=false 计入 errors，异常耗时不会把 p50 拉歪', () => {
    for (let i = 0; i < 20; i += 1) recordLatency('k', 10, { ok: true });
    recordLatency('k', 5_000, { ok: false });
    const line = onlyLine();
    expect(line.errors).toBe(1);
    expect(line.p50).toBe(10);
    expect(line.max).toBe(5_000);
  });

  it('avgBytes 按次数平均，只对带字节数的打点有意义', () => {
    recordLatency('upstream x.com', 20, { bytes: 2048 });
    recordLatency('upstream x.com', 20, { bytes: 4096 });
    expect(onlyLine().avgBytes).toBe(3072);
  });

  it('非法耗时（NaN / 负数）直接丢弃', () => {
    recordLatency('k', Number.NaN);
    recordLatency('k', -1);
    expect(latencySnapshot()).toEqual([]);
  });
});

describe('startLatencyLog', () => {
  beforeEach(() => {
    resetLatency();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetLatency();
  });

  it('健康流量一行都不打（不是每分钟刷屏）', () => {
    const log = vi.fn();
    const stop = startLatencyLog(log, { slowMs: 500 });
    for (let i = 0; i < 30; i += 1) recordLatency('http GET /a', 12);
    vi.advanceTimersByTime(60_000);
    expect(log).not.toHaveBeenCalled();
    stop();
  });

  it('p95 超过阈值才打，且 flush 后清空', () => {
    const log = vi.fn();
    const stop = startLatencyLog(log, { slowMs: 500 });
    // 20 条样本才够算 p95：都填 600ms，p95 就是 600，稳稳越过 500 的阈值
    for (let i = 0; i < 20; i += 1) recordLatency('http GET /a', 600);
    vi.advanceTimersByTime(60_000);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('http GET /a');
    // 下一分钟没有新样本：不该再打，也不该重复上一分钟的数字
    vi.advanceTimersByTime(60_000);
    expect(log).toHaveBeenCalledTimes(1);
    stop();
  });

  it('出过错必报（哪怕耗时很低），带 err= 计数', () => {
    const log = vi.fn();
    const stop = startLatencyLog(log, { slowMs: 500 });
    recordLatency('upstream x.com', 30, { ok: false });
    vi.advanceTimersByTime(60_000);
    expect(log.mock.calls[0]?.[0]).toContain('err=1');
    stop();
  });
});
