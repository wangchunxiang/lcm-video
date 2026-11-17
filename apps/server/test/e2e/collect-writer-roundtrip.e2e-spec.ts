import type { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CategoryInfo, MappingInfo, SourceVod } from '../../src/modules/collect/types';
import { processPage } from '../../src/modules/collect/writer';
import { VodEntity } from '../../src/modules/vod/vod.entity';
import { VodPlayEntity } from '../../src/modules/vod-play/vod-play.entity';
import { createTestApp } from './helpers/app';

/**
 * 一页数据的往返次数：每条记录只需要一个 SAVEPOINT。
 *
 * 回归背景：原先每条记录在成功后还要发一次 `RELEASE SAVEPOINT`，
 * 一页 100 条就是 100 次多余的网络往返。MySQL 里重名 savepoint 会覆盖上一个，
 * 所以成功路径不需要释放。
 */
describe('采集写入：单条记录的 savepoint 往返', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let categoryId: string;
  let parentCategoryId: string;
  const trackedNames: string[] = [];

  const item = (index: number): SourceVod => ({
    vodId: `e2ert-${index}`,
    name: `【往返测试】影片 ${index}`,
    typeId: '1',
    typeName: '往返测试分类',
    typePid: '0',
    subName: '',
    cover: '',
    actor: '',
    director: '',
    writer: '',
    intro: '',
    content: '',
    remarks: '',
    releaseDate: '',
    episodeCount: 2,
    area: '',
    lang: '',
    year: 2025,
    updatedAt: null,
    playFrom: 'e2ert',
    playUrl: 'https://cdn.example.com/e2ert/index.m3u8#x$1',
  });

  /** 只统计保存点语句，其它 SQL 不看 */
  async function countSavepointStatements(count: number): Promise<{ savepoint: number; release: number }> {
    // 驱动自己的 QueryRunner（MysqlQueryRunner）才是真正发语句的类
    const probe = dataSource.createQueryRunner();
    const prototype = Object.getPrototypeOf(probe) as {
      query: (sql: string, parameters?: unknown[], ...rest: unknown[]) => Promise<unknown>;
    };
    await probe.release();
    const original = prototype.query;
    const tally = { savepoint: 0, release: 0 };
    prototype.query = function patched(this: unknown, sql: string, ...rest: unknown[]) {
      if (typeof sql === 'string') {

        if (/^\s*SAVEPOINT/i.test(sql)) tally.savepoint += 1;
        if (/^\s*RELEASE\s+SAVEPOINT/i.test(sql)) tally.release += 1;
      }
      return original.call(this, sql, ...(rest as [unknown[], ...unknown[]]));
    };

    try {
      const items = Array.from({ length: count }, (_, index) => item(index));
      trackedNames.push(...items.map((entry) => entry.name));
      const mapping = new Map<string, MappingInfo>([['1', { categoryId, status: 1 }]]);
      // categories 的键是**本站**分类 id
      const categories = new Map<string, CategoryInfo>([
        [categoryId, { id: categoryId, pid: parentCategoryId, name: '往返测试分类', matchNames: [] }],
      ]);
      const result = await processPage(dataSource, { sourceId: '1', items, mapping, categories });
      expect(result.counters.inserted).toBe(count);
    } finally {
      prototype.query = original;
    }

    return tally;
  }

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    ({ categoryId, parentCategoryId } = created.fixtures);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (trackedNames.length > 0) {
      const vods = await dataSource
        .getRepository(VodEntity)
        .find({ where: { name: In(trackedNames) }, select: { id: true } });
      const ids = vods.map((row) => row.id);
      if (ids.length > 0) {
        await dataSource.getRepository(VodPlayEntity).delete({ vodId: In(ids) });
        await dataSource.getRepository(VodEntity).delete({ id: In(ids) });
      }
    }
    await app.close();
  });

  it('每条记录只发一个 SAVEPOINT，成功路径不发 RELEASE', async () => {
    const tally = await countSavepointStatements(20);

    expect(tally.savepoint).toBe(20);
    expect(tally.release).toBe(0);
  });
});
