import { createHmac, timingSafeEqual } from 'node:crypto';
import { WEB_API_PREFIX } from '../../common/http/api-prefix';

/**
 * 播放列表代理的签名。
 *
 * 为什么不用「域名白名单」：一个采集源的播放地址散落在它自己的 CDN 上，和 `api_url`
 * 常常不是同一个域名（西瓜资源就是这样），维护域名表会一直漏。改成对**地址本身**签名：
 * 只有本服务在 `/api/web/play` 里签出的地址才会被代理，外部塞任意 url 一律 403，
 * 不会变成公开代理（SSRF）。
 *
 * 签名密钥复用 `JWT_SECRET`——文件里没有新增 env，签名域也只在本服务的播放链路上用。
 */

/** 截断到 32 个 hex 字符（128 bit），对「猜一个合法地址」足够，URL 也不会太长 */
const SIG_LENGTH = 32;

function digest(secret: string, sourceId: string, url: string): string {
  return createHmac('sha256', secret).update(`${sourceId}\n${url}`, 'utf8').digest('hex').slice(0, SIG_LENGTH);
}

/** 生成代理地址，形如 `/api/web/playlist?sourceId=1&u=<base64url>&sig=<hex>` */
export function signPlaylistPath(secret: string, sourceId: string, url: string): string {
  const token = Buffer.from(url, 'utf8').toString('base64url');
  const query = new URLSearchParams({ sourceId, u: token, sig: digest(secret, sourceId, url) });
  return `/${WEB_API_PREFIX}/playlist?${query.toString()}`;
}

/** 把 base64url 还原成原始地址；非法输入返回空串 */
export function decodePlaylistToken(token: string): string {
  // `base64url` 解码遇到非法字符只会丢字符，不会抛错，所以不需要 try/catch
  return Buffer.from(token, 'base64url').toString('utf8');
}

/** 校验签名是否由本服务生成；长度不等时直接返回 false，避免 timingSafeEqual 抛错 */
export function verifyPlaylistPath(secret: string, sourceId: string, url: string, sig: string): boolean {
  const expected = digest(secret, sourceId, url);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
}
