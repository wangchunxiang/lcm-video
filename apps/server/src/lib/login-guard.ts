const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  fails: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

export function isLocked(key: string): boolean {
  const entry = entries.get(key);
  if (!entry) return false;
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
