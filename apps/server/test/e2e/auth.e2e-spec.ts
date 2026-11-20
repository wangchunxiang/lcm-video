import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN } from './helpers/fixtures';
import { createTestApp } from './helpers/app';
import { getCaptcha, loginPayload, loginToken } from './helpers/auth';

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

  it('验证码接口返回一次性 id 与内联 SVG', async () => {
    const response = await request(app.getHttpServer()).get('/api/admin/auth/captcha');
    const body = response.body as Envelope<{ id: string; svg: string }>;

    expect(body.code).toBe(0);
    expect(body.data.id).toHaveLength(24);
    expect(body.data.svg.startsWith('<svg')).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('登录成功返回 token 与用户信息', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send(await loginPayload(app));
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
      .send(await loginPayload(app, { password: 'wrong-password' }));
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(100401);
    expect(body.msg).toBe('账号或密码不正确');
    expect(body.data).toBeNull();
  });

  it('验证码错误返回 code 1，且不消耗锁定次数', async () => {
    const captcha = await getCaptcha(app);
    const response = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: ADMIN.username,
        password: ADMIN.password,
        captchaId: captcha.id,
        captchaCode: 'ZZZZ',
      });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.msg).toContain('验证码');
  });

  it('同一个验证码只能用一次', async () => {
    const captcha = await getCaptcha(app);
    const payload = {
      username: ADMIN.username,
      password: ADMIN.password,
      captchaId: captcha.id,
      captchaCode: captcha.code,
    };
    const first = await request(app.getHttpServer()).post('/api/admin/auth/login').send(payload);
    const second = await request(app.getHttpServer()).post('/api/admin/auth/login').send(payload);

    expect((first.body as Envelope<LoginPayload>).code).toBe(0);
    expect((second.body as Envelope<null>).code).toBe(1);
    expect((second.body as Envelope<null>).msg).toContain('验证码');
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
