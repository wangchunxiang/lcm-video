import { reactive } from 'vue';
import { api } from './api/client.ts';

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
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
  const user = await api.post<AdminUser>('/auth/login', { username, password });
  auth.user = user;
  auth.loaded = true;
  return user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // 退出失败也清空本地状态
  }
  auth.user = null;
}
