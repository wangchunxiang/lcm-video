import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

/** 生成 `scrypt$N$r$p$salt$hash` 格式的密码哈希（与旧库已有数据同格式）。 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEY_LEN, { N, r: R, p: P }).toString('hex');
  return ['scrypt', N, R, P, salt, hash].join('$');
}

/** 校验密码。格式不对、参数缺失一律当作不通过。 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4] ?? '';
  const expected = parts[5] ?? '';
  if (!n || !r || !p || !salt || !expected) return false;

  const actual = scryptSync(plain, salt, expected.length / 2, { N: n, r, p }).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
