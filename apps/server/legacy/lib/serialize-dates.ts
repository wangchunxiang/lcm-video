/**
 * 把响应体里的 Date 统一转成 `YYYY-MM-DD HH:mm:ss`（进程时区 Asia/Shanghai）。
 *
 * 数据库里的 DATETIME 表示的是"本地墙上时间"，直接 JSON 序列化会变成 UTC 的 ISO 串，
 * 后台表格里就会显示成 03:34:08Z 这种和库里对不上的值。这里统一在出口格式化一次。
 */

const pad = (value: number): string => String(value).padStart(2, '0');

export function formatDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function convert(value: unknown, depth: number): unknown {
  if (depth > 12) return value;
  if (value instanceof Date) return formatDateTime(value);
  if (Array.isArray(value)) return value.map((item) => convert(item, depth + 1));
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = convert(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** 只处理对象/数组，字符串、Buffer、流原样返回 */
export function serializeDates(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  if (Buffer.isBuffer(payload)) return payload;
  return convert(payload, 0);
}
