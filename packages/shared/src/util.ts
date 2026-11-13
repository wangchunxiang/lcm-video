/** 抓取外部文本时统一使用的 UA：不少图床/采集源会按 UA 拦截默认的 undici 客户端 */
export const FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** 从 URL 取小写域名（去掉端口）；解析不了返回 fallback */
export function hostOf(url: string, fallback = ''): string {
  const text = String(url ?? '').trim();
  if (!text) return fallback;
  try {
    return new URL(text.startsWith('//') ? `https:${text}` : text)
      .host.toLowerCase()
      .replace(/:\d+$/, '');
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

/** 采集计数：与采集记录、采集任务的累计字段一一对应 */
export interface CollectCounters {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

/** 采集结论的一行摘要：`100条：新增10|更新20|跳过30|忽略5|失败2` */
export function formatCollectSummary(counters: CollectCounters): string {
  return `${counters.total}条：新增${counters.inserted}|更新${counters.updated}|跳过${counters.skipped}|忽略${counters.ignored}|失败${counters.failed}`;
}

/** 把历史格式（`共 100 条：新增 10、更新 20…`）换成紧凑格式，其余文字原样保留 */
export function normalizeCollectMessage(message: string): string {
  return message.replace(
    /共\s*(\d+)\s*条[：:]\s*新增\s*(\d+)\s*[、,，|｜]\s*更新\s*(\d+)\s*[、,，|｜]\s*跳过\s*(\d+)\s*[、,，|｜]\s*忽略\s*(\d+)\s*[、,，|｜]\s*失败\s*(\d+)/g,
    '$1条：新增$2|更新$3|跳过$4|忽略$5|失败$6',
  );
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

/**
 * 把数据序列化成可以安全内嵌进 <script> 的 JSON：
 * 剧集/片名里出现 `</script>` 时，未转义的 `<` 会提前闭合标签。
 */
export function escapeJson(value: unknown): string {
  return JSON.stringify(value).split('<').join(String.fromCharCode(92) + 'u003c');
}
