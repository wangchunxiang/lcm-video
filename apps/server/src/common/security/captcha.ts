import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * 登录验证码（图形 + 一次性令牌）。
 *
 * 为什么放进程内存：与 `login-lock.ts` 同一套部署前提——单进程、重启后丢失可接受
 * （重启只会让正在填的验证码失效，用户点一下刷新即可）。
 *
 * 流程：`GET /api/admin/auth/captcha` 生成一个 `id` + SVG，答案只留在服务端；
 * 登录时把 `id` 与用户填的字符一起提交，`verifyCaptcha()` 校验后**立即删除**，
 * 所以同一个验证码不能用第二次（重放了也只能拿到「已过期」）。
 */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 去掉 0/O/1/I/L 这类易混字符后取 4 位：32^4 ≈ 100 万，配合一次性作废足够 */
const CODE_LENGTH = 4;
/** 有效期：够用户看清并输入，又不至于留着长期可解 */
const TTL_MS = 2 * 60 * 1000;
/** 内存上限：超过就丢弃最早过期的，避免被刷接口撑爆 */
const MAX_ENTRIES = 2_000;

interface Entry {
  code: string;
  expiresAt: number;
}

/** id → 答案。Map 的插入顺序即生成顺序，清理时直接从头删。 */
const entries = new Map<string, Entry>();

function cleanup(now: number): void {
  for (const [id, entry] of entries) {
    if (entry.expiresAt > now) continue;
    entries.delete(id);
  }
  // 全都没过期但数量超了：按插入顺序（最早的）淘汰
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done === true) break;
    entries.delete(oldest.value);
  }
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}

/** 转义成 SVG 文本安全的写法：只用到英数字，仍然做一次以防将来改成中文 */
function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** 生成 SVG：字符随机旋转/上下浮动，叠几条干扰线和噪点，肉眼易读、脚本难切 */
function renderSvg(code: string): string {
  const width = 108;
  const height = 38;
  const step = width / (CODE_LENGTH + 1);
  const chars: string[] = [];
  for (let i = 0; i < code.length; i += 1) {
    const x = Math.round(step * (i + 1));
    const y = 26 + randomInt(5) - 2;
    const rotate = randomInt(31) - 15;
    const size = 21 + randomInt(4);
    chars.push(
      `<text x="${x}" y="${y}" font-size="${size}" font-family="Menlo,Consolas,monospace"` +
        ` font-weight="700" fill="#2b3a4a" text-anchor="middle"` +
        ` transform="rotate(${rotate} ${x} ${y})">${escapeXml(code[i] ?? '')}</text>`,
    );
  }
  const lines: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    lines.push(
      `<line x1="${randomInt(width)}" y1="${randomInt(height)}" x2="${randomInt(width)}" y2="${randomInt(height)}"` +
        ` stroke="#9fb3c8" stroke-width="${1 + randomInt(2)}" opacity="0.55" />`,
    );
  }
  const dots: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    dots.push(`<circle cx="${randomInt(width)}" cy="${randomInt(height)}" r="1" fill="#9fb3c8" opacity="0.5" />`);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#f4f7fb" rx="6" />` +
    lines.join('') +
    chars.join('') +
    dots.join('') +
    '</svg>'
  );
}

export interface CaptchaVO {
  /** 一次性令牌，登录时原样带回 */
  id: string;
  /** 直接内联渲染的 SVG 源码 */
  svg: string;
}

/** 生成一个验证码。 */
export function createCaptcha(): CaptchaVO {
  const now = Date.now();
  cleanup(now);
  const id = randomBytes(12).toString('hex');
  const code = randomCode();
  entries.set(id, { code, expiresAt: now + TTL_MS });
  return { id, svg: renderSvg(code) };
}

/**
 * 校验并作废。不管对错都删掉这一次的 `id`：
 * 猜错也得多拿一个新验证码，等于强制每次尝试都过一遍图形识别。
 */
export function verifyCaptcha(id: string, input: string): boolean {
  const entry = entries.get(id);
  if (entry === undefined) return false;
  entries.delete(id);
  if (entry.expiresAt <= Date.now()) return false;
  const expected = Buffer.from(entry.code.toUpperCase());
  const actual = Buffer.from(input.trim().toUpperCase());
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** 仅供测试：取出某次验证码的答案（不删除，测试里可以并发多发几次登录）。 */
export function peekCaptcha(id: string): string | null {
  return entries.get(id)?.code ?? null;
}
