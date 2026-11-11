import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import { loginToken } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface CategoryRow {
  id: string;
  pid: string;
  name: string;
  alias: string;
  sort: number;
  isShow: number;
}

interface PagePayload<T> {
  items: T[];
  total: number;
}

describe('CRUD /api/admin/category', () => {
  let app: INestApplication;
  let token: string;
  const createdAlias = 'e2e-created';

  beforeAll(async () => {
    ({ app } = await createTestApp());
    token = await loginToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('列表按 take/skip 分页，返回 items + total', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/category')
      .query({ take: 1, skip: 0 })
      .set('Authorization', `Bearer ${token}`);
    const body = response.body as Envelope<PagePayload<CategoryRow>>;

    expect(body.code).toBe(0);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('创建后可以按 id 读回，字段已按实体转换', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/category')
      .set('Authorization', `Bearer ${token}`)
      .send({ pid: '0', name: 'E2E 新建分类', alias: createdAlias, sort: 9 });
    const createdBody = created.body as Envelope<CategoryRow>;

    expect(createdBody.code).toBe(0);
    expect(createdBody.data.alias).toBe(createdAlias);
    expect(createdBody.data.pid).toBe('0');

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/category/${createdBody.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    const detailBody = detail.body as Envelope<CategoryRow>;
    expect(detailBody.code).toBe(0);
    expect(detailBody.data.name).toBe('E2E 新建分类');
  });

  it('重复别名被服务预检拦成 1，不是 500', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/category')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '重复别名', alias: createdAlias });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.msg).toContain('已被占用');
  });

  it('校验失败返回逐字段提示', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/category')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', alias: 'Bad_Alias' });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.msg).toContain('分类名不能为空');
    expect(body.msg).toContain('别名只能包含小写字母、数字和减号');
  });

  it('多余字段被 whitelist 拒绝', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/category')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '多余字段', alias: 'e2e-extra', notAllowed: 1 });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.msg).toContain('notAllowed');
  });

  it('删除后再读返回「记录不存在」', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/admin/category')
      .query({ take: 100, skip: 0 })
      .set('Authorization', `Bearer ${token}`);
    const listBody = list.body as Envelope<PagePayload<CategoryRow>>;
    const target = listBody.data.items.find((item) => item.alias === createdAlias);
    expect(target).toBeDefined();

    const removed = await request(app.getHttpServer())
      .delete(`/api/admin/category/${target?.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect((removed.body as Envelope<unknown>).code).toBe(0);

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/category/${target?.id}`)
      .set('Authorization', `Bearer ${token}`);
    const body = detail.body as Envelope<null>;
    expect(body.code).toBe(1);
    expect(body.msg).toBe('记录不存在');
  });

  it('分类树与下拉选项走自定义动作路由', async () => {
    const tree = await request(app.getHttpServer())
      .post('/api/admin/category/tree')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const treeBody = tree.body as Envelope<Array<{ alias: string; children: unknown[] }>>;
    expect(treeBody.code).toBe(0);
    expect(treeBody.data.some((node) => node.alias === 'e2e-movie')).toBe(true);

    const options = await request(app.getHttpServer())
      .post('/api/admin/category/options')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect((options.body as Envelope<unknown[]>).code).toBe(0);
  });
});
