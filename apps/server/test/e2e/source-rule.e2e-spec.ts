import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import { loginToken } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface RuleRow {
  id: string;
  sourceId: string;
  kind: number;
  fromUrl: string;
  toUrl: string;
}

interface ApplyResult {
  needConfirm: boolean;
  total: number;
  affected: number;
}

/**
 * 替换规则的原地址支持多条：源站反复换域名时，历史域名写进同一条规则，
 * 重刷一次全部指到新域名。这里验证「存成一行一条」「重叠拦截」「重刷生效」三段。
 */
describe('地址替换规则 /api/admin/source-rule', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let sourceId: string;
  let vodId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    dataSource = app.get(DataSource);
    token = await loginToken(app);
    vodId = context.fixtures.vodId;

    const created = await request(app.getHttpServer())
      .post('/api/admin/collect-source')
      .set(auth())
      .send({ name: 'E2E 替换规则源', apiUrl: 'http://rule.example.com/api.php/provide/vod' });
    sourceId = (created.body as Envelope<{ id: string }>).data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('多个原地址按行存入，逗号/分号也会被规整成换行', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/source-rule')
      .set(auth())
      .send({
        sourceId,
        kind: 2,
        fromUrl: ' img.image8899.net \nimg.ffzy888.com，pps.vodfeiss.com；\n\nimg.ffzy888.com ',
        toUrl: 'fffgood.com',
        sort: 1,
      });
    const body = response.body as Envelope<RuleRow>;

    expect(body.code).toBe(0);
    // 空行去掉、重复项（含只差协议的）去掉，顺序保持输入顺序
    expect(body.data.fromUrl).toBe('img.image8899.net\nimg.ffzy888.com\npps.vodfeiss.com');
  });

  it('同一个原地址出现在第二条规则里会被拦成 1', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/source-rule')
      .set(auth())
      .send({ sourceId, kind: 2, fromUrl: 'tupian.ffeiimg.com\nimg.ffzy888.com', toUrl: 'x.com' });
    const body = response.body as Envelope<null>;

    expect(body.code).toBe(1);
    expect(body.msg).toContain('img.ffzy888.com');
  });

  it('重刷只认命中的那一行，多个原地址里任意一个都能替换', async () => {
    await dataSource.query('UPDATE lcm_vod SET cover = ?, cover_host = ? WHERE id = ?', [
      'https://pps.vodfeiss.com/upload/1.jpg',
      'pps.vodfeiss.com',
      vodId,
    ]);

    const rules = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM lcm_source_rule WHERE source_id = ? AND kind = 2 ORDER BY id DESC LIMIT 1',
      [sourceId],
    );
    const rule = rules[0];
    if (rule === undefined) throw new Error('规则没建出来');

    const preview = await request(app.getHttpServer())
      .post('/api/admin/source-rule/apply')
      .set(auth())
      .send({ id: rule.id, confirm: false });
    expect((preview.body as Envelope<ApplyResult>).data.total).toBeGreaterThanOrEqual(1);

    const applied = await request(app.getHttpServer())
      .post('/api/admin/source-rule/apply')
      .set(auth())
      .send({ id: rule.id, confirm: true });
    expect((applied.body as Envelope<ApplyResult>).data.affected).toBeGreaterThanOrEqual(1);

    const rows = await dataSource.query<Array<{ cover: string; coverHost: string }>>(
      'SELECT cover, cover_host AS coverHost FROM lcm_vod WHERE id = ?',
      [vodId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('影片不存在');
    // 新地址不带协议 → 地址自身的 https 保持
    expect(row.cover).toBe('https://fffgood.com/upload/1.jpg');
    expect(row.coverHost).toBe('fffgood.com');
  });
});
