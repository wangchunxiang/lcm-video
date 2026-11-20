import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { peekCaptcha } from '../../../src/common/security/captcha';
import { ADMIN } from './fixtures';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T | null;
}

/**
 * 取一个验证码并读出答案。
 * e2e 跑在同一进程里，可以直接问内存里的那份答案——这里刻意不给接口开后门，
 * 生产代码里没有任何「跳过验证码」的开关。
 */
export async function getCaptcha(app: INestApplication): Promise<{ id: string; code: string }> {
  const response = await request(app.getHttpServer()).get('/api/admin/auth/captcha');
  const body = response.body as Envelope<{ id: string; svg: string }>;
  if (body.code !== 0 || body.data === null) {
    throw new Error(`取验证码失败：${JSON.stringify(body)}`);
  }
  const code = peekCaptcha(body.data.id);
  if (code === null) throw new Error('验证码没有进内存');
  return { id: body.data.id, code };
}

/** 一次完整的登录请求体（账号 + 密码 + 一对新的验证码）。 */
export async function loginPayload(
  app: INestApplication,
  overrides: { username?: string; password?: string } = {},
): Promise<Record<string, string>> {
  const captcha = await getCaptcha(app);
  return {
    username: overrides.username ?? ADMIN.username,
    password: overrides.password ?? ADMIN.password,
    captchaId: captcha.id,
    captchaCode: captcha.code,
  };
}

/** 登录拿 token；失败直接抛错，避免后续断言变成一堆 100401。 */
export async function loginToken(app: INestApplication): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send(await loginPayload(app));

  const body = response.body as Envelope<{ token: string }>;
  if (body.code !== 0 || body.data === null) {
    throw new Error(`登录失败：${JSON.stringify(body)}`);
  }
  return body.data.token;
}
