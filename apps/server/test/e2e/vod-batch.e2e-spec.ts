import type { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VodEntity } from '../../src/modules/vod/vod.entity';
import { VodPlayEntity } from '../../src/modules/vod-play/vod-play.entity';
import { createTestApp } from './helpers/app';
import { loginToken } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface VodRow {
  id: string;
  name: string;
  status: number;
  categoryId: string;
}

/**
 * 批量操作的两条回归：SQL 语法（`IN (...)` 而不是 `WHERE id = '1', '2'`）
 * 和删除级联（删影片必须同时删掉它的线路行）。
 */
describe('批量操作 /api/admin/vod', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;
  let categoryId: string;
  const createdIds: string[] = [];

  /** 建影片，返回 id（按创建顺序） */
  async function createVods(names: readonly string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const response = await request(app.getHttpServer())
        .post('/api/admin/vod')
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryId, name });
      const body = response.body as Envelope<VodRow>;
      expect(body.code).toBe(0);
      ids.push(body.data.id);
      createdIds.push(body.data.id);
    }
    return ids;
  }

  async function insertPlay(vodId: string, sourceFrom: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO lcm_vod_play (vod_id, source_id, source_from, play_url, collected_at)
       VALUES (?, NULL, ?, 'https://cdn.example.com/e2e/index.m3u8#e2e$3', NOW())`,
      [vodId, sourceFrom],
    );
  }

  const countPlays = (vodIds: readonly string[]): Promise<number> =>
    dataSource.getRepository(VodPlayEntity).count({ where: { vodId: In([...vodIds]) } });

  const findVods = (ids: readonly string[]): Promise<VodEntity[]> =>
    dataSource.getRepository(VodEntity).find({ where: { id: In([...ids]) } });

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    ({ categoryId } = created.fixtures);
    token = await loginToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await dataSource.getRepository(VodPlayEntity).delete({ vodId: In(createdIds) });
      await dataSource.getRepository(VodEntity).delete({ id: In(createdIds) });
    }
    await app.close();
  });

  it('批量上下架一次命中所有选中行', async () => {
    const ids = await createVods(['E2E 批量上架 A', 'E2E 批量上架 B']);

    const response = await request(app.getHttpServer())
      .post('/api/admin/vod/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, action: 'status', status: 0 });
    const body = response.body as Envelope<{ updated: number }>;

    expect(body.code).toBe(0);
    expect(body.data.updated).toBe(2);

    const rows = await findVods(ids);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => Number(row.status) === 0)).toBe(true);
  });

  it('批量改分类把选中行一起移动', async () => {
    const ids = await createVods(['E2E 批量分类 A']);

    const response = await request(app.getHttpServer())
      .post('/api/admin/vod/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, action: 'category', categoryId });
    const body = response.body as Envelope<{ updated: number }>;

    expect(body.code).toBe(0);
    expect(body.data.updated).toBe(1);
  });

  it('批量删除连线路一起清掉，不留孤儿行', async () => {
    const ids = await createVods(['E2E 级联删除 A', 'E2E 级联删除 B']);
    const [first, second] = ids;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    await insertPlay(String(first), 'e2e-a');
    await insertPlay(String(second), 'e2e-b');
    expect(await countPlays(ids)).toBe(2);

    // 逗号分隔：nest-crud 会把 query 里的标量包成 ['a,b']，服务里再拆开
    const response = await request(app.getHttpServer())
      .delete(`/api/admin/vod/delete/bulk?ids=${ids.join(',')}`)
      .set('Authorization', `Bearer ${token}`);
    const body = response.body as Envelope<{ success: boolean }>;

    expect(body.code).toBe(0);
    expect(body.data.success).toBe(true);
    expect(await countPlays(ids)).toBe(0);
    expect(await findVods(ids)).toHaveLength(0);
  });
});
