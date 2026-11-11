import { reactive } from 'vue';
import { api } from './api/client.ts';
import { setToken } from './session.ts';

export interface AdminUser {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  username: string;
  nickname: string;
}

interface LoginResult {
  token: string;
  expireAt: number;
  user: AdminUser;
}

interface AuthState {
  user: AdminUser | null;
  loaded: boolean;
}

export const auth = reactive<AuthState>({
  user: null,
  loaded: false,
});

export async function fetchMe(): Promise<AdminUser | null> {
  try {
    auth.user = await api.get<AdminUser>('/auth/me');
  } catch {
    auth.user = null;
  }
  auth.loaded = true;
  return auth.user;
}

export async function login(username: string, password: string): Promise<AdminUser> {
  const result = await api.post<LoginResult>('/auth/login', { username, password });
  setToken(result.token);
  auth.user = result.user;
  auth.loaded = true;
  return result.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // 退出失败也清空本地状态
  }
  setToken(null);
  auth.user = null;
}
