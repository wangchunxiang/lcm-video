/**
 * 会话存储：v3 用 Bearer token（架构决策 5.3），token 存 localStorage。
 *
 * 单独一个模块是为了避免循环依赖：`api/client.ts` 需要读 token，
 * `auth.ts` 需要写 token，两边都只依赖这里。
 */

const TOKEN_KEY = 'lcm_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // 隐私模式下 localStorage 会抛错，退化成「每次刷新都要重新登录」
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 同上，忽略
  }
}

/** token 失效时跳登录页；`redirect` 带上当前地址，登录后跳回来。 */
export function redirectToLogin(): void {
  // 构建时 BASE_URL 是 /admin/，开发时是 /
  const base = import.meta.env.BASE_URL;
  const current = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === `${base}login`) return;
  window.location.assign(`${base}login?redirect=${encodeURIComponent(current)}`);
}

/** 把带 base 前缀的地址转成 vue-router 的路径（/admin/vods → /vods）。 */
export function stripBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  if (base === '/') return path;
  const prefix = base.replace(/\/$/, '');
  return path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path;
}
