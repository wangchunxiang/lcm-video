/** 设备识别：独立成模块，不依赖 env，便于单测。 */
export function isMobileRequest(headers: Record<string, unknown>): boolean {
  const hint = headers['sec-ch-ua-mobile'];
  if (hint === '?1') return true;

  const ua = typeof headers['user-agent'] === 'string' ? headers['user-agent'] : '';
  if (!ua) return false;
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua)) return false;
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false;
  return /iPhone|iPod|Android|Windows Phone|HarmonyOS|Mobile Safari/i.test(ua);
}

