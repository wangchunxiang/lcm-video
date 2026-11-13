/**
 * 接口路径前缀。
 *
 * 后台管理接口统一挂 `/api/admin`，前台只读接口统一挂 `/api/web`，
 * 控制器里只写资源名（`@AppCrud({ path: 'vod' })`），前缀在这里集中拼。
 */
export const ADMIN_API_PREFIX = 'api/admin';
export const WEB_API_PREFIX = 'api/web';
