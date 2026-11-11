import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN } from './fixtures';

/** 登录拿 token；失败直接抛错，避免后续断言变成一堆 100401。 */
export async function loginToken(app: INestApplication): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ username: ADMIN.username, password: ADMIN.password });

  const body = response.body as { code: number; msg: string; data: { token: string } | null };
  if (body.code !== 0 || body.data === null) {
    throw new Error(`登录失败：${JSON.stringify(body)}`);
  }
  return body.data.token;
}
