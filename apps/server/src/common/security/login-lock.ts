/**
 * 登录失败计数：同一个 IP 连续失败 5 次，锁 15 分钟。
 * 放进程内存即可——单进程部署，重启后清零可以接受（决策 5.3 的会话模型）。
 */
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  fails: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

export function isLocked(key: string): boolean {
  const entry = entries.get(key);
  if (entry === undefined) return false;
  if (entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil !== 0) entries.delete(key);
  return false;
}

export function recordFailure(key: string): void {
  const entry = entries.get(key) ?? { fails: 0, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILS) {
    entry.fails = 0;
    entry.lockedUntil = Date.now() + LOCK_MS;
  }
  entries.set(key, entry);
}

export function resetFailures(key: string): void {
  entries.delete(key);
}
