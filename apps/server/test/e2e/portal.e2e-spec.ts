import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import type { Fixtures } from './helpers/fixtures';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface CategoryNode {
  alias: string;
  children: CategoryNode[];
}

interface VodCard {
  id: string;
  name: string;
  categoryId: string;
}

describe('门户只读接口 /api/web', () => {
  let app: INestApplication;
  let fixtures: Fixtures;

  beforeAll(async () => {
    ({ app, fixtures } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('分类树带出两级结构', async () => {
    const response = await request(app.getHttpServer()).get('/api/web/categories');
    const body = response.body as Envelope<CategoryNode[]>;

    expect(body.code).toBe(0);
    const parent = body.data.find((node) => node.alias === 'e2e-movie');
    expect(parent).toBeDefined();
    expect(parent?.children.some((child) => child.alias === fixtures.categoryAlias)).toBe(true);
  });

  it('首页返回分类树与分区卡片', async () => {
    const response = await request(app.getHttpServer()).get('/api/web/home');
    const body = response.body as Envelope<{
      categories: CategoryNode[];
      rows: Array<{ title: string; more: string; items: VodCard[] }>;
    }>;

    expect(body.code).toBe(0);
    expect(Array.isArray(body.data.categories)).toBe(true);
    expect(body.data.rows.length).toBeGreaterThan(0);
    const items = body.data.rows.flatMap((row) => row.items);
    expect(items.some((item) => item.id === fixtures.vodId)).toBe(true);
  });

  it('分类列表按别名取片', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/web/list/${fixtures.categoryAlias}`)
      .query({ take: 10, skip: 0 });
    const body = response.body as Envelope<{ items: VodCard[]; total: number; category: { alias: string } }>;

    expect(body.code).toBe(0);
    expect(body.data.category.alias).toBe(fixtures.categoryAlias);
    expect(body.data.items.map((item) => item.id)).toContain(fixtures.vodId);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('detail 返回影片与线路', async () => {
    const response = await request(app.getHttpServer()).get(`/api/web/detail/${fixtures.vodId}`);
    const body = response.body as Envelope<{ vod: { id: string; name: string }; lines: unknown[]; related: unknown[] }>;

    expect(body.code).toBe(0);
    expect(body.data.vod.id).toBe(fixtures.vodId);
    expect(body.data.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('play 默认第一集，episodes 从线路里拆出来', async () => {
    const response = await request(app.getHttpServer()).get(`/api/web/play/${fixtures.vodId}`);
    const body = response.body as Envelope<{ current: number; episodes: Array<{ name: string }> }>;

    expect(body.code).toBe(0);
    expect(body.data.current).toBe(1);
    expect(body.data.episodes[0]?.name).toBe('第1集');
  });

  it('search 用 wd 参数命中片名', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/web/search')
      .query({ wd: 'E2E' });
    const body = response.body as Envelope<{ items: VodCard[]; total: number }>;

    expect(body.code).toBe(0);
    expect(body.data.items.map((item) => item.id)).toContain(fixtures.vodId);
  });

  it('不存在的影片返回 1 而不是 500', async () => {
    const response = await request(app.getHttpServer()).get('/api/web/detail/999999999');
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.data).toBeNull();
  });
});
