import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface HealthPayload {
  db: string;
  dbMs: number;
  uptimeSec: number;
  rssMb: number;
  runningTasks: number;
}

describe('探活 GET /healthz', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('免登录返回数据库与进程状态', async () => {
    const response = await request(app.getHttpServer()).get('/healthz');
    const body = response.body as Envelope<HealthPayload>;

    expect(response.status).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.db).toBe('up');
    expect(body.data.dbMs).toBeGreaterThanOrEqual(0);
    expect(body.data.uptimeSec).toBeGreaterThan(0);
    expect(body.data.rssMb).toBeGreaterThan(0);
    expect(body.data.runningTasks).toBe(0);
  });

  it('404 也走统一信封，HTTP 状态仍是 200', async () => {
    const response = await request(app.getHttpServer()).get('/no-such-route');
    const body = response.body as Envelope<null>;

    expect(response.status).toBe(200);
    expect(body.code).not.toBe(0);
    expect(body.data).toBeNull();
  });
});
