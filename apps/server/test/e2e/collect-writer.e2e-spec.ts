import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SourceVod } from '../../src/modules/collect/types';
import { processPage } from '../../src/modules/collect/writer';
import { createTestApp } from './helpers/app';

/**
 * 同一页里出现两条同名同年的影片（不同 source_vod_id、不同线路）时，
 * 只能建一行 lcm_vod，两条线路都并到这一行上。
 *
 * 回归背景：判重结果原本在循环前一次算好，页内后出现的那条看不到刚插入的行，
 * 于是各插一行，线上因此出现过 9 组重复。
 */
describe('采集写入：同页内的重复影片', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let sourceId: string;
  let categoryId: string;
  let categoryPid: string;

  const NAME = '【测试】同页重复影片';
  const SOURCE = '测试源-同页重复';
  const LINE_A = 'e2edup-a';
  const LINE_B = 'e2edup-b';

  const item = (vodId: string, playFrom: string): SourceVod => ({
    vodId,
    name: NAME,
    typeId: '1',
    typeName: '测试分类',
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
    playFrom,
    playUrl: '第1集$http://example.invalid/1.m3u8#第2集$http://example.invalid/2.m3u8',
  });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    const rows = await dataSource.query<Array<{ id: string; pid: string; name: string }>>(
      "SELECT id, pid, name FROM lcm_category WHERE pid <> '0' ORDER BY id LIMIT 1",
    );
    const category = rows[0];
    if (!category) throw new Error('测试库没有二级分类');
    categoryId = category.id;
    categoryPid = category.pid;

    const created = await dataSource.query<{ insertId: number }>(
      'INSERT INTO lcm_collect_source (name, api_url, is_enabled) VALUES (?, ?, 1)',
      ['测试源-同页重复', 'http://example.invalid/api.php/provide/vod/'],
    );
    sourceId = String(created.insertId);
  });

  afterAll(async () => {
    // 各 spec 共用一个测试库，用例自己收拾干净（线路注册表、播放地址、影片、源）
    await dataSource.query('DELETE FROM lcm_play_line WHERE source_from IN (?, ?)', [LINE_A, LINE_B]);
    await dataSource.query('DELETE FROM lcm_vod_play WHERE source_id = ?', [sourceId]);
    await dataSource.query('DELETE FROM lcm_vod WHERE name = ?', [NAME]);
    await dataSource.query('DELETE FROM lcm_collect_source WHERE id = ?', [sourceId]);
    await app.close();
  });

  it('只建一行影片，两条线路都并进去', async () => {
    const result = await processPage(dataSource, {
      sourceId,
      items: [item('9001', LINE_A), item('9002', LINE_B)],
      mapping: new Map([['1', { categoryId, status: 1 }]]),
      categories: new Map([[categoryId, { id: categoryId, pid: categoryPid, name: '测试分类', matchNames: [] }]]),
    });

    expect(result.counters.total).toBe(2);
    expect(result.counters.inserted).toBe(1);
    expect(result.counters.updated).toBe(1);

    const vods = await dataSource.query<Array<{ id: string }>>('SELECT id FROM lcm_vod WHERE name = ?', [NAME]);
    expect(vods).toHaveLength(1);

    const lines = await dataSource.query<Array<{ source_from: string }>>(
      'SELECT source_from FROM lcm_vod_play WHERE vod_id = ? ORDER BY source_from',
      [vods[0]?.id],
    );
    expect(lines.map((line) => line.source_from)).toEqual([LINE_A, LINE_B]);

    // 采集结束把本次第一次出现的线路登记进线路表：写下归属与默认显示名（源站名）
    const registered = await dataSource.query<Array<{ source_from: string; source_id: string; name: string }>>(
      'SELECT source_from, source_id, name FROM lcm_play_line WHERE source_from IN (?, ?) ORDER BY source_from',
      [LINE_A, LINE_B],
    );
    expect(registered.map((row) => row.source_from)).toEqual([LINE_A, LINE_B]);
    for (const row of registered) {
      expect(String(row.source_id)).toBe(String(sourceId));
      expect(row.name).toBe(SOURCE);
    }
  });
});
