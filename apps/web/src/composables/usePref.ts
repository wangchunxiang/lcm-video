/**
 * 本地偏好的读写（localStorage）。
 *
 * 隐私模式、配额写满都会抛异常，但“记不住偏好”不该影响播放，所以统一在这里吞掉，
 * 调用方只关心值本身。
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存不了就只影响这台设备的记忆 */
  }
}

export function removePref(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
}
