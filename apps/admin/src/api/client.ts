import { createHttpClient } from '@lcm/api-client';

/**
 * 后台接口客户端。统一信封解包、错误码、查询串拼接都在 `@lcm/api-client` 里，
 * 这里只绑定前缀和会话方式。
 *
 * 注意：v3 服务端已改为 Bearer token（登录返回 token），而后台页面仍按 v2 的
 * cookie 会话发请求。对接时给 `createHttpClient` 传 `getToken` 即可，调用方不用改。
 */
const http = createHttpClient({
  baseUrl: '/api/admin',
  credentials: 'same-origin',
});

export { ApiError } from '@lcm/api-client';

export const api = {
  get: http.get,
  post: http.post,
  put: http.put,
  del: http.delete,
  upload: <T>(file: Blob) => http.upload<T>('/upload', file),
};
