import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenPayload {
  /** 用户 ID */
  uid: number;
  /** 密码版本，用于改密后让旧 token 失效 */
  pv: number;
  /** 过期时间（秒级时间戳） */
  exp: number;
}

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** 生成 HS256 JWT。 */
export function signToken(payload: TokenPayload, secret: string): string {
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const data = `${head}.${body}`;
  return `${data}.${sign(data, secret)}`;
}

/** 校验并解出载荷，失败返回 null。 */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [head, body, signature] = parts as [string, string, string];
  const expected = sign(`${head}.${body}`, secret);

  const a = Buffer.from(signature);
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
