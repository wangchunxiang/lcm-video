import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN } from './helpers/fixtures';
import { createTestApp } from './helpers/app';
import { loginToken } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface LoginPayload {
  token: string;
  expireAt: string;
  user: { id: string; username: string; nickname: string };
}

describe('鉴权 /api/admin/auth', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('登录成功返回 token 与用户信息', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send(ADMIN);
    const body = response.body as Envelope<LoginPayload>;

    expect(body.code).toBe(0);
    expect(typeof body.data.token).toBe('string');
    expect(body.data.token.split('.')).toHaveLength(3);
    expect(body.data.user.username).toBe(ADMIN.username);
    expect(new Date(body.data.expireAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('密码错误返回 100401 且不泄露是账号错还是密码错', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: ADMIN.username, password: 'wrong-password' });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(100401);
    expect(body.msg).toBe('账号或密码不正确');
    expect(body.data).toBeNull();
  });

  it('缺字段被全局管道拦下，msg 带字段名', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: ADMIN.username });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.msg).toContain('密码');
  });

  it('无 token 访问受保护接口返回 100401', async () => {
    const response = await request(app.getHttpServer()).get('/api/admin/vod');
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(100401);
  });

  it('带 token 可以拿到自己的资料', async () => {
    const token = await loginToken(app);
    const response = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const body = response.body as Envelope<{ username: string }>;

    expect(body.code).toBe(0);
    expect(body.data.username).toBe(ADMIN.username);
  });

  it('伪造 token 返回 100401', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Authorization', 'Bearer not-a-jwt');
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(100401);
  });
});
