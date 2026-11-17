import type { SourceRuntime } from './types';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class CollectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectError';
  }
}

/**
 * 单个采集源的请求客户端。
 * 负责：拼装查询参数、按 interval_sec 限流、超时、失败重试。
 * v2 只保留 JSON 接口（XML 分支已按决策去掉）。
 */
export class CollectClient {
  private readonly source: SourceRuntime;

  /** 「停止采集」的中断信号：一旦 abort，当前请求立即断，且不再重试 */
  private readonly signal?: AbortSignal;

  /** 上一次请求结束的时刻，限流计时起点 */
  private lastEndAt = 0;

  constructor(source: SourceRuntime, signal?: AbortSignal) {
    this.source = source;
    this.signal = signal;
  }

  private buildUrl(params: Record<string, string | number | undefined>, base?: string): string {
    const target = base ?? this.source.apiUrl;
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      throw new CollectError(`采集接口地址不合法：${target}`);
    }

    const preset = this.source.apiParams.replace(/^\?/, '').trim();
    if (preset) {
      for (const [key, value] of new URLSearchParams(preset)) url.searchParams.set(key, value);
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async throttle(): Promise<void> {
    if (this.lastEndAt === 0) return;
    const wait = this.source.intervalSec * 1000 - (Date.now() - this.lastEndAt);
    if (wait > 0) await sleep(wait);
  }

  private async fetchOnce(url: string): Promise<unknown> {
    const timeout = Math.max(1, this.source.timeout) * 1000;
    // 超时和「停止采集」两个信号合成一个：任一触发都立即断掉这次请求
    const signal = this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    let response: Response;
    try {
      response = await fetch(url, {
        signal,
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      if (this.signal?.aborted) throw new CollectError('已停止采集');
      // fetch 只报 'fetch failed'，真正原因（ECONNREFUSED / 证书 / DNS）在 cause 上
      const cause = (error as { cause?: { message?: string } }).cause;
      const reason = cause?.message ?? (error instanceof Error ? error.message : String(error));
      throw new CollectError(`请求失败：${reason}（${url}）`);
    }

    if (!response.ok) throw new CollectError(`请求失败：HTTP ${response.status}`);

    const text = await response.text();
    if (!text.trim()) throw new CollectError('请求失败：响应为空');

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CollectError('请求失败：JSON 解析失败');
    }
  }

  /** 请求一次接口，失败按 retry_times 重试，每次重试前同样按 interval_sec 等待。 */
  async request(params: Record<string, string | number | undefined>): Promise<unknown> {
    const url = this.buildUrl(params);
    const retries = Math.max(0, this.source.retryTimes);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (this.signal?.aborted) throw new CollectError('已停止采集');
      await this.throttle();
      try {
        const data = await this.fetchOnce(url);
        this.lastEndAt = Date.now();
        return data;
      } catch (error) {
        this.lastEndAt = Date.now();
        // 用户点了停止：不再按 retry_times 重试，立刻退出
        if (this.signal?.aborted) throw new CollectError('已停止采集');
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new CollectError('请求失败：未知错误');
  }
}
