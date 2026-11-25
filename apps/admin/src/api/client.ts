import { createHttpClient } from '@lcm/api-client';
import { getToken, unauthorized } from '../session.ts';

/**
 * 后台接口客户端。统一信封解包、错误码、查询串拼接都在 `@lcm/api-client` 里，
 * 这里只绑定前缀与会话方式（v3：Bearer token，失效跳登录）。
 */
const http = createHttpClient({
  // 默认同源 /api/admin；部署到别处时用 .env 的 VITE_API_BASE 覆盖
  baseUrl: import.meta.env.VITE_API_BASE || '/api/admin',
  getToken,
  onUnauthorized: unauthorized,
});

export { ApiError } from '@lcm/api-client';

/**
 * 长任务接口：不设超时（默认 30 秒会把这些请求掐掉）。
 * 适用于回源站抓分类、AI 分析、批量扫描/修复、手动触发整轮采集。
 */
const long = <T>(path: string, json?: unknown, query?: Record<string, unknown>): Promise<T> =>
  http.request<T>(path, { method: 'POST', json, query, timeoutMs: 0 });

export const api = {
  get: http.get,
  post: http.post,
  put: http.put,
  /** 长任务版 POST，不设超时。 */
  longPost: long,
  /** 长任务版 GET，不设超时。 */
  longGet: <T>(path: string, query?: Record<string, unknown>): Promise<T> =>
    http.request<T>(path, { query, timeoutMs: 0 }),
  /** 长任务版 DELETE，不设超时（删采集源要连带清几万行，30 秒不够）。 */
  longDelete: <T>(path: string, query?: Record<string, unknown>): Promise<T> =>
    http.request<T>(path, { method: 'DELETE', query, timeoutMs: 0 }),
  /** 流式接口：返回原始 Response，调用方自己读 body。 */
  stream: http.stream,
  patch: <T>(path: string, json?: unknown, query?: Record<string, unknown>) => http.request<T>(path, { method: 'PATCH', json, query }),
  del: http.delete,
};
