import type { FastifyPluginAsync } from 'fastify';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { collectSource, sourceRule, vod, vodPlay } from '@lcm/db';
import { applyPlayUrlRules } from '@lcm/shared';
import { toInt } from '@lcm/shared';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

type Options = { db: Db };

type RuleBody = {
  source_id?: unknown;
  kind?: unknown;
  from_url?: unknown;
  to_url?: unknown;
  is_enabled?: unknown;
  sort?: unknown;
};

const text = (value: unknown, max: number): string => String(value ?? '').trim().slice(0, max);

type ParsedRule =
  | { ok: true; value: { sourceId: number; kind: number; fromUrl: string; toUrl: string; isEnabled: number; sort: number } }
  | { ok: false; msg: string };

function parseBody(body: RuleBody): ParsedRule {
  const sourceId = toInt(body.source_id);
  if (sourceId <= 0) return { ok: false, msg: '请选择采集源' };
  const kind = toInt(body.kind, 1);
  if (kind !== 1 && kind !== 2) return { ok: false, msg: '类型只能是播放地址或图片地址' };
  const fromUrl = text(body.from_url, 255);
  const toUrl = text(body.to_url, 255);
  if (!fromUrl) return { ok: false, msg: '请填写原地址' };
  if (!toUrl) return { ok: false, msg: '请填写新地址' };
  if (fromUrl === toUrl) return { ok: false, msg: '原地址与新地址不能相同' };
  if (/\s/.test(fromUrl) || /\s/.test(toUrl)) return { ok: false, msg: '地址里不能有空格' };
  return {
    ok: true,
    value: {
      sourceId,
      kind,
      fromUrl,
      toUrl,
      isEnabled: toInt(body.is_enabled, 1) === 0 ? 0 : 1,
      sort: Math.max(0, toInt(body.sort, 0)),
    },
  };
}

/** 地址替换规则：全局列表 + 增删改 + 重刷历史数据 */
export const sourceRuleRoutes: FastifyPluginAsync<Options> = async (app, { db }) => {
  app.get('/', async (request, reply) => {
    const query = request.query as { source_id?: string; kind?: string; status?: string; keyword?: string };
    const sourceId = toInt(query.source_id);
    const kind = toInt(query.kind);
    const status = toInt(query.status, -1);
    const conditions = [];
    if (sourceId > 0) conditions.push(eq(sourceRule.sourceId, sourceId));
    if (kind === 1 || kind === 2) conditions.push(eq(sourceRule.kind, kind));
    if (status === 0 || status === 1) conditions.push(eq(sourceRule.isEnabled, status));
    const keyword = String(query.keyword ?? '').trim();
    if (keyword) conditions.push(like(sourceRule.fromUrl, `%${keyword}%`));

    const rows = await db
      .select({
        id: sourceRule.id,
        sourceId: sourceRule.sourceId,
        sourceName: collectSource.name,
        kind: sourceRule.kind,
        fromUrl: sourceRule.fromUrl,
        toUrl: sourceRule.toUrl,
        isEnabled: sourceRule.isEnabled,
        sort: sourceRule.sort,
        createdAt: sourceRule.createdAt,
      })
      .from(sourceRule)
      .leftJoin(collectSource, eq(collectSource.id, sourceRule.sourceId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(sourceRule.sourceId), asc(sourceRule.sort), desc(sourceRule.id));

    const items = rows.map((row) => ({ ...row, sourceName: row.sourceName ?? '（已删除的源）' }));
    return ok(reply, { items, total: items.length });
  });

  app.post('/', async (request, reply) => {
    const parsed = parseBody((request.body ?? {}) as RuleBody);
    if (!parsed.ok) return fail(reply, 400, ErrorCode.BAD_REQUEST, parsed.msg);
    const [source] = await db
      .select({ id: collectSource.id })
      .from(collectSource)
      .where(eq(collectSource.id, parsed.value.sourceId))
      .limit(1);
    if (!source) return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集源不存在');
    const [created] = await db.insert(sourceRule).values(parsed.value).$returningId();
    return ok(reply, { id: created?.id ?? 0 });
  });

  app.put('/:id', async (request, reply) => {
    const id = toInt((request.params as { id: string }).id);
    const parsed = parseBody((request.body ?? {}) as RuleBody);
    if (!parsed.ok) return fail(reply, 400, ErrorCode.BAD_REQUEST, parsed.msg);
    const [exists] = await db.select({ id: sourceRule.id }).from(sourceRule).where(eq(sourceRule.id, id)).limit(1);
    if (!exists) return fail(reply, 404, ErrorCode.NOT_FOUND, '规则不存在');
    await db.update(sourceRule).set(parsed.value).where(eq(sourceRule.id, id));
    return ok(reply, { id });
  });

  app.delete('/:id', async (request, reply) => {
    const id = toInt((request.params as { id: string }).id);
    const [exists] = await db.select({ id: sourceRule.id }).from(sourceRule).where(eq(sourceRule.id, id)).limit(1);
    if (!exists) return fail(reply, 404, ErrorCode.NOT_FOUND, '规则不存在');
    await db.delete(sourceRule).where(eq(sourceRule.id, id));
    return ok(reply, { id });
  });

  /** 把这条规则套用到已有数据；confirm=false 只返回影响条数 */
  app.post('/:id/apply', async (request, reply) => {
    const id = toInt((request.params as { id: string }).id);
    const confirm = (request.body as { confirm?: unknown } | null)?.confirm === true;

    const [rule] = await db.select().from(sourceRule).where(eq(sourceRule.id, id)).limit(1);
    if (!rule) return fail(reply, 404, ErrorCode.NOT_FOUND, '规则不存在');
    if (rule.isEnabled !== 1) return fail(reply, 400, ErrorCode.BAD_REQUEST, '规则已停用，先启用再重刷');

    if (rule.kind === 2) {
      const prefix = `${rule.fromUrl}%`;
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(vod)
        .where(like(vod.cover, prefix));
      const total = Number(countRow?.count ?? 0);
      if (!confirm) return ok(reply, { needConfirm: true, total, affected: 0 });
      if (total === 0) return ok(reply, { needConfirm: false, total: 0, affected: 0 });
      await db.execute(
        sql`UPDATE lcm_vod SET cover = CONCAT(${rule.toUrl}, SUBSTRING(cover, ${rule.fromUrl.length + 1})) WHERE cover LIKE ${prefix}`,
      );
      return ok(reply, { needConfirm: false, total, affected: total });
    }

    // 播放地址：只能是本源的线路，逐集替换
    const rows = await db
      .select({ id: vodPlay.id, playUrl: vodPlay.playUrl })
      .from(vodPlay)
      .where(and(eq(vodPlay.sourceId, rule.sourceId), like(vodPlay.playUrl, `%${rule.fromUrl}%`)));
    const changes: Array<{ id: number; playUrl: string }> = [];
    for (const row of rows) {
      const next = applyPlayUrlRules(row.playUrl, [rule]);
      if (next !== row.playUrl) changes.push({ id: row.id, playUrl: next });
    }
    if (!confirm) return ok(reply, { needConfirm: true, total: changes.length, affected: 0 });
    if (changes.length === 0) return ok(reply, { needConfirm: false, total: 0, affected: 0 });

    // 分批写，单条语句控制体积，避免 MEDIUMTEXT 撑爆 max_allowed_packet
    let affected = 0;
    let batch: Array<{ id: number; playUrl: string }> = [];
    let bytes = 0;
    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      const cases = sql.join(
        batch.map((row) => sql`WHEN ${row.id} THEN ${row.playUrl}`),
        sql` `,
      );
      const ids = sql.join(batch.map((row) => sql`${row.id}`), sql`, `);
      await db.execute(sql`UPDATE lcm_vod_play SET play_url = CASE id ${cases} ELSE play_url END WHERE id IN (${ids})`);
      affected += batch.length;
      batch = [];
      bytes = 0;
    };
    for (const row of changes) {
      batch.push(row);
      bytes += row.playUrl.length + 32;
      if (batch.length >= 100 || bytes >= 400_000) await flush();
    }
    await flush();
    return ok(reply, { needConfirm: false, total: changes.length, affected });
  });
};
