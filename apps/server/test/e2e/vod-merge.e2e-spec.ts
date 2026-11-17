import type { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countEpisodes } from '@lcm/shared';
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
}

/**
 * 一键合并：把淘汰影片的线路搬到保留项上。
 *
 * 合并实现从「逐条 INSERT ... ON DUPLICATE KEY UPDATE」改成「读现有行 + 一条多行插入」，
 * 这里守住三条语义：线路要搬过来、集数少的不能覆盖集数多的、淘汰项要删掉。
 */
describe('重复影片合并 /api/admin/vod-merge', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;
  let categoryId: string;
  const createdIds: string[] = [];

  const linesOf = (vodId: string): Promise<VodPlayEntity[]> =>
    dataSource.getRepository(VodPlayEntity).find({ where: { vodId } });

  async function createVod(name: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/admin/vod')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId, name });
    const body = response.body as Envelope<VodRow>;
    expect(body.code).toBe(0);
    createdIds.push(body.data.id);
    return body.data.id;
  }

  async function addLine(
    vodId: string,
    sourceFrom: string,
    episodes: number,
    sourceId: string | null = '7',
  ): Promise<void> {
    // countEpisodes 数的是 '#' 的个数 +1，所以 n 集就有 n-1 个 '#'
    const url = `https://cdn.example.com/e2e/${sourceFrom}/index.m3u8${'#x$1'.repeat(episodes - 1)}`;
    await dataSource
      .getRepository(VodPlayEntity)
      .insert({ vodId, sourceId, sourceFrom, playUrl: url, sourceVodId: `e2e-${sourceFrom}` });
  }

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

  it('把淘汰项的线路搬到保留项，再删掉淘汰项', async () => {
    const keepId = await createVod('E2E 合并保留项');
    const otherId = await createVod('E2E 合并淘汰项');
    await addLine(keepId, 'e2emove-keep', 2);
    await addLine(otherId, 'e2emove-a', 3);
    await addLine(otherId, 'e2emove-b', 4);

    const response = await request(app.getHttpServer())
      .post('/api/admin/vod-merge/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [keepId, otherId], keepId });
    const body = response.body as Envelope<{ merged: number }>;

    expect(body.code).toBe(0);
    expect(body.data.merged).toBe(1);

    const kept = await linesOf(keepId);
    expect(kept.map((line) => line.sourceFrom).sort()).toEqual(['e2emove-a', 'e2emove-b', 'e2emove-keep']);
    expect(await linesOf(otherId)).toHaveLength(0);
    expect(await dataSource.getRepository(VodEntity).count({ where: { id: otherId } })).toBe(0);
  });

  it('集数更少的线路不覆盖保留项已有的同名线路', async () => {
    const keepId = await createVod('E2E 合并保留项 B');
    const otherId = await createVod('E2E 合并淘汰项 B');
    await addLine(keepId, 'e2emove-c', 5);
    await addLine(otherId, 'e2emove-c', 2);

    const response = await request(app.getHttpServer())
      .post('/api/admin/vod-merge/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [keepId, otherId], keepId });
    const body = response.body as Envelope<{ merged: number }>;
    expect(body.code).toBe(0);

    const kept = await linesOf(keepId);
    expect(kept).toHaveLength(1);
    const line = kept[0] as VodPlayEntity;
    // 5 集的原值保留，不被 2 集覆盖
    expect(countEpisodes(line.playUrl)).toBe(5);
  });

  it('集数更多的线路覆盖保留项已有的同名线路', async () => {
    const keepId = await createVod('E2E 合并保留项 C');
    const otherId = await createVod('E2E 合并淘汰项 C');
    await addLine(keepId, 'e2emove-d', 2);
    await addLine(otherId, 'e2emove-d', 6);

    const response = await request(app.getHttpServer())
      .post('/api/admin/vod-merge/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [keepId, otherId], keepId });
    const bodyC = response.body as Envelope<{ merged: number }>;
    expect(bodyC.code).toBe(0);

    const kept = await linesOf(keepId);
    expect(kept).toHaveLength(1);
    const line = kept[0] as VodPlayEntity;
    expect(countEpisodes(line.playUrl)).toBe(6);
    expect(line.sourceVodId).toBe('e2e-e2emove-d');
  });
});
