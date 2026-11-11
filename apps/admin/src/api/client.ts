import { createHttpClient } from '@lcm/api-client';
import { getToken, redirectToLogin } from '../session.ts';

/**
 * 后台接口客户端。统一信封解包、错误码、查询串拼接都在 `@lcm/api-client` 里，
 * 这里只绑定前缀与会话方式（v3：Bearer token，失效跳登录）。
 */
const http = createHttpClient({
  // 默认同源 /api/admin；部署到别处时用 .env 的 VITE_API_BASE 覆盖
  baseUrl: import.meta.env.VITE_API_BASE || '/api/admin',
  getToken,
  onUnauthorized: redirectToLogin,
});

export { ApiError } from '@lcm/api-client';

export const api = {
  get: http.get,
  post: http.post,
  put: http.put,
  patch: <T>(path: string, json?: unknown, query?: Record<string, unknown>) => http.request<T>(path, { method: 'PATCH', json, query }),
  del: http.delete,
};
