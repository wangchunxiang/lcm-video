import { XMLParser } from 'fast-xml-parser';

export interface SourceRuntime {
  id: number;
  name: string;
  apiUrl: string;
  apiFormat: string;
  apiParams: string;
  intervalSec: number;
  timeout: number;
  retryTimes: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === 'video' || name === 'ty' || name === 'dd' || name === 'dt',
});

export class CollectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectError';
  }
}

/**
 * 单个采集源的请求客户端。
 * 负责：拼装查询参数、按 interval_sec 限流、超时、失败重试、按格式解析响应。
 */
export class CollectClient {
  private readonly source: SourceRuntime;

  /** 上一次请求结束的时刻，限流计时起点 */
  private lastEndAt = 0;

  constructor(source: SourceRuntime) {
    this.source = source;
  }

  get apiFormat(): string {
    return this.source.apiFormat;
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
      for (const [key, value] of new URLSearchParams(preset)) {
        url.searchParams.set(key, value);
      }
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async throttle(): Promise<void> {
    if (this.lastEndAt === 0) return;
    const interval = this.source.intervalSec * 1000;
    const wait = interval - (Date.now() - this.lastEndAt);
    if (wait > 0) await sleep(wait);
  }

  private async fetchText(url: string, format: string): Promise<string> {
    const timeout = Math.max(1, this.source.timeout) * 1000;
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { accept: format === 'xml' ? 'application/xml,text/xml' : 'application/json' },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new CollectError(`请求失败：${reason}`);
    }

    if (!response.ok) {
      throw new CollectError(`请求失败：HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text.trim()) throw new CollectError('请求失败：响应为空');
    return text;
  }

  private async fetchOnce(url: string, format: string): Promise<unknown> {
    const text = await this.fetchText(url, format);

    if (format === 'xml') {
      try {
        return xmlParser.parse(text);
      } catch {
        throw new CollectError('请求失败：XML 解析失败');
      }
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CollectError('请求失败：JSON 解析失败');
    }
  }

  /**
   * 请求一次接口，失败按 retry_times 重试，每次重试前同样按 interval_sec 等待。
   * format 不传时用采集源配置的格式；获取分类固定传 json，因为 XML 的 class 不带父子级。
   */
  async request(
    params: Record<string, string | number | undefined>,
    format?: 'json' | 'xml',
    options: { url?: string } = {},
  ): Promise<unknown> {
    const url = this.buildUrl(params, options.url);
    const actualFormat = format ?? this.source.apiFormat;
    const retries = Math.max(0, this.source.retryTimes);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      await this.throttle();
      try {
        const data = await this.fetchOnce(url, actualFormat);
        this.lastEndAt = Date.now();
        return data;
      } catch (error) {
        this.lastEndAt = Date.now();
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new CollectError('请求失败：未知错误');
  }
}
