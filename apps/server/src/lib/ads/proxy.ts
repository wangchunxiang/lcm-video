import '../net.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from '@lcm/db';
import { cleanMedia, fetchMediaPlaylist, loadAdPatterns } from './skip.ts';

/**
 * 分片代理：客户端（尤其是 iOS 的 WKWebView）直接访问源站 CDN 时，
 * 经常被防盗链、TLS 或 IPv6 路由挡住（表现为 403「你没有访问所请求的资源的许可」）。
 * 这里让服务端去拉分片，客户端只跟本站打交道。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** 分片地址签名有效期，6 小时足够看完一整部电影 */
const TTL_SEC = 6 * 60 * 60;

export const SEGMENT_PATH = '/play/seg';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function absolutize(base: string, uri: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** 把源站分片地址签成一个短 token，避免把代理变成任意地址的开放跳板 */
export function signSegment(url: string, secret: string, ttlSec = TTL_SEC): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${expires}|${url}`;
  const body = b64url(payload);
  return `${body}.${signature(payload, secret).slice(0, 32)}`;
}

/** 校验 token，返回源站地址；过期或签名不对返回 null */
export function readSegmentToken(token: string, secret: string): string | null {
  const index = token.lastIndexOf('.');
  if (index <= 0) return null;
  const body = token.slice(0, index);
  const mac = token.slice(index + 1);
  let payload: string;
  try {
    payload = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = signature(payload, secret).slice(0, 32);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  const sep = payload.indexOf('|');
  if (sep <= 0) return null;
  const expires = Number.parseInt(payload.slice(0, sep), 10);
  if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return null;
  const url = payload.slice(sep + 1);
  return /^https?:\/\//i.test(url) ? url : null;
}

/** 把播放列表里的分片、密钥、初始化段地址都换成本站代理地址 */
function rewrite(text: string, base: string, secret: string): string {
  const proxy = (uri: string): string => {
    const absolute = absolutize(base, uri);
    if (!/^https?:\/\//i.test(absolute)) return uri;
    return `${SEGMENT_PATH}?u=${encodeURIComponent(signSegment(absolute, secret))}`;
  };

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${proxy(uri)}"`);
      }
      return proxy(trimmed);
    })
    .join('\n');
}

/**
 * 生成给客户端播放的播放列表：先解析 master，再按广告特征剔除，
 * 最后把所有地址换成本站代理地址。失败返回 null，调用方回退到原始地址。
 */
export async function buildProxiedPlaylist(
  db: Db,
  sourceId: number,
  url: string,
  secret: string,
): Promise<string | null> {
  const media = await fetchMediaPlaylist(url);
  if (!media) return null;

  let text = media.text;
  const patterns = await loadAdPatterns(db, sourceId).catch(() => []);
  if (patterns.length > 0) {
    const cleaned = cleanMedia(media.text, media.base, patterns);
    if (cleaned) text = cleaned.text;
  }
  return rewrite(text, media.base, secret);
}

/** 拉取源站分片，透传 Range，供代理路由使用 */
export async function fetchSegment(url: string, range?: string): Promise<Response> {
  const headers: Record<string, string> = { 'user-agent': UA, accept: '*/*' };
  if (range) headers.range = range;
  return fetch(url, { headers, redirect: 'follow' });
}
