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

/**
 * token 失效时的处理。这里不认识 router（`api/client.ts` 也不该认识），只提供一个注入点，
 * 由 `main.ts` 启动时注册成 router 跳转：跳登录页的 URL 只由 router 一种方式生成，
 * 不会出现「手工拼了 BASE_URL 的地址」和「router 生成的不带 base 的地址」两套格式。
 */
let onUnauthorized: () => void = () => undefined;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/** 接口层拿到 401 时调用：转给上面注册的那支处理函数。 */
export function unauthorized(): void {
  onUnauthorized();
}
