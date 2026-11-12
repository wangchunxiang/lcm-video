/**
 * 时间展示：接口返回的是 UTC 的 ISO 字符串（如 `2026-10-26T20:18:18.000Z`），
 * 页面统一按浏览器本地时区显示成 `YYYY-MM-DD HH:mm:ss`。
 *
 * 每个页面自己 import，不包成组件——列表页的版式本来就各写各的。
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** 本地 `YYYY-MM-DD HH:mm:ss`；空值返回空串，非法值原样返回 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 本地 `MM-DD HH:mm`，给空间紧张的地方用 */
export function formatShortTime(value: string | null | undefined): string {
  const full = formatDateTime(value);
  return full ? full.slice(5, 16) : '';
}
