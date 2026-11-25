/** 抓取外部文本时统一使用的 UA：不少图床/采集源会按 UA 拦截默认的 undici 客户端 */
export const FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** 从 URL 取小写域名（去掉端口）；解析不了返回 fallback */
export function hostOf(url: string, fallback = ''): string {
  const text = String(url ?? '').trim();
  if (!text) return fallback;
  try {
    // `hostname` 已经是小写且不含端口，不用再手工 toLowerCase + 剥端口
    return new URL(text.startsWith('//') ? `https:${text}` : text).hostname;
  } catch {
    return fallback;
  }
}

/** 转整数，非法值返回 fallback */
export function toInt(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/** 取字符串并去掉首尾空白，非字符串返回空串 */
export function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * BIGINT 主键全链路按字符串传，比较大小必须走 BigInt：
 * 用 Number() 会在超过 2^53 后失真，导致排序不稳定、分页重复或漏条。
 */
export function compareId(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** LIKE 模式串里的通配符转义：搜索框输入 `%` 不能变成“命中全表” */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 拉一次文本，失败抛错（错误信息带上域名，便于定位是哪个站点的问题） */
export async function fetchTextOnce(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': FETCH_UA, accept: '*/*' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}（${hostOf(url)}）`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`响应为空（${hostOf(url)}）`);
  return text;
}

/** 拉文本并重试一次：源站偶发 403 / 超时很常见 */
export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  try {
    return await fetchTextOnce(url, timeoutMs);
  } catch (error) {
    const first = error instanceof Error ? error.message : String(error);
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      return await fetchTextOnce(url, timeoutMs);
    } catch (second) {
      const msg = second instanceof Error ? second.message : String(second);
      throw new Error(`${msg}；重试前：${first}`);
    }
  }
}
