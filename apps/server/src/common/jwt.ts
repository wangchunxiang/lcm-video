import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenPayload {
  /** 管理员 id */
  uid: number;
  /** 密码版本：改密后 +1，旧 token 随之失效 */
  pv: number;
  /** 过期时间（秒级时间戳） */
  exp: number;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signature(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** 生成 HS256 JWT（不引第三方依赖，格式与旧服务端一致）。 */
export function signToken(payload: TokenPayload, secret: string): string {
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const data = `${head}.${body}`;
  return `${data}.${signature(data, secret)}`;
}

/** 校验签名与过期时间，失败返回 null。 */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [head, body, sign] = parts as [string, string, string];
  const expected = signature(`${head}.${body}`, secret);

  const a = Buffer.from(sign);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  if (typeof payload.uid !== 'number' || typeof payload.pv !== 'number') return null;
  return payload;
}

/** 从 `Authorization: Bearer xxx` 里取出 token。 */
export function bearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  const prefix = 'bearer ';
  if (header.slice(0, prefix.length).toLowerCase() !== prefix) return null;
  const token = header.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}
