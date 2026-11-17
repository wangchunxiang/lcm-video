/**
 * 请求层基础设施：统一信封解包、错误码、Bearer token 注入。
 *
 * 服务端约定（架构决策 2.3 / 2.4）：HTTP 状态恒为 200，业务结果看 `code`，
 * `code === 0` 为成功，失败时 `msg` 直接给前端展示。
 * 这个包只放与框架无关的纯 TS，不引入任何运行时依赖。
 */

export const CODE_OK = 0;
/** 未登录 / token 失效 / 被踢下线。 */
export const CODE_UNAUTHORIZED = 100401;

export interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
  reqId?: string;
}

export type QueryParams = Record<string, unknown>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  json?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** 超时毫秒数；0 表示不限时（采集、AI 分析这类长任务）。默认取客户端配置的 30 秒。 */
  timeoutMs?: number;
}

export class ApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(message: string, code: number, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 与 DOM 的 RequestCredentials 等价；这里自己声明，免得这个包依赖 DOM 类型。 */
export type CredentialsMode = 'omit' | 'same-origin' | 'include';

export interface HttpClientOptions {
  /** 接口前缀，如 `/api/admin`、`/api/web`；开发期由 vite proxy 转发。 */
  baseUrl: string;
  /** 返回 Bearer token；返回空值时不带 Authorization 头（v2 的 cookie 会话）。 */
  getToken?: () => string | null | undefined;
  /** 收到 401 / 100401 时回调，用于清理本地登录态并跳转登录页。 */
  onUnauthorized?: (error: ApiError) => void;
  credentials?: CredentialsMode;
  /** 默认超时毫秒数，默认 30000；0 表示不限时。单个请求可用 `timeoutMs` 覆盖。 */
  timeoutMs?: number;
  /** 便于测试注入。 */
  fetchImpl?: typeof fetch;
}

export interface HttpClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, json?: unknown, query?: QueryParams): Promise<T>;
  put<T>(path: string, json?: unknown, query?: QueryParams): Promise<T>;
  delete<T>(path: string, query?: QueryParams): Promise<T>;
  upload<T>(path: string, file: Blob, field?: string): Promise<T>;
  /** 流式接口：返回原始 Response，调用方自己读 `body`（SSE、逐行 JSON 等非信封响应）。 */
  stream(path: string, options?: RequestOptions): Promise<Response>;
}

/**
 * 把查询参数拼成查询串。对象/数组按 JSON 序列化，
 * 正好对上 nest-crud 的 `where` / `order` 参数格式。
 */
export function buildQueryString(query?: QueryParams): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string') {
      params.set(key, value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      params.set(key, String(value));
    } else {
      params.set(key, JSON.stringify(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T> | null> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    return null;
  }
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, getToken, onUnauthorized, credentials = 'same-origin', timeoutMs = 30_000 } = options;
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function unwrap<T>(response: Response, payload: Envelope<T> | null, fallback: string): T {
    if (!response.ok) {
      throw new ApiError(payload?.msg ?? `${fallback}（HTTP ${response.status}）`, payload?.code ?? -1, response.status);
    }
    if (!payload) {
      throw new ApiError('响应不是合法的 JSON 信封', -1, response.status);
    }
    if (payload.code !== CODE_OK) {
      const error = new ApiError(payload.msg || fallback, payload.code, response.status);
      if (payload.code === CODE_UNAUTHORIZED || response.status === 401) onUnauthorized?.(error);
      throw error;
    }
    return payload.data;
  }

  /** 合并超时与外部 signal：任一触发都会中断请求；毫秒数为 0 时只用外部 signal。 */
  function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
    if (ms <= 0) return signal;
    const timer = AbortSignal.timeout(ms);
    if (!signal) return timer;
    return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timer]) : signal;
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const { method = 'GET', query, json, headers, signal, timeoutMs: perRequest } = init;
    const mergedHeaders = authHeaders(headers);
    let body: string | undefined;
    if (json !== undefined) {
      mergedHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }

    const response = await doFetch(baseUrl + path + buildQueryString(query), {
      method,
      headers: mergedHeaders,
      body,
      credentials,
      signal: withTimeout(signal, perRequest ?? timeoutMs),
    });
    return unwrap<T>(response, await readEnvelope<T>(response), '请求失败');
  }

  async function stream(path: string, init: RequestOptions = {}): Promise<Response> {
    const { method = 'POST', query, json, headers, signal, timeoutMs: perRequest } = init;
    const mergedHeaders = authHeaders(headers);
    let body: string | undefined;
    if (json !== undefined) {
      mergedHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const response = await doFetch(baseUrl + path + buildQueryString(query), {
      method,
      headers: mergedHeaders,
      body,
      credentials,
      signal: withTimeout(signal, perRequest ?? timeoutMs),
    });
    if (!response.ok || !response.body) {
      const payload = await readEnvelope<unknown>(response);
      throw new ApiError(payload?.msg ?? `请求失败（HTTP ${response.status}）`, payload?.code ?? -1, response.status);
    }
    return response;
  }

  async function upload<T>(path: string, file: Blob, field = 'file'): Promise<T> {
    const form = new FormData();
    form.append(field, file);
    const response = await doFetch(baseUrl + path, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      credentials,
      signal: withTimeout(undefined, timeoutMs),
    });
    return unwrap<T>(response, await readEnvelope<T>(response), '上传失败');
  }

  return {
    request,
    stream,
    get: (path, query, signal) => request(path, { query, signal }),
    post: (path, json, query) => request(path, { method: 'POST', json, query }),
    put: (path, json, query) => request(path, { method: 'PUT', json, query }),
    delete: (path, query) => request(path, { method: 'DELETE', query }),
    upload,
  };
}
