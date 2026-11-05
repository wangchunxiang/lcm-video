import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { Db } from '@lcm/db';
import { category, collectSource, collectSourceCategory, vod, vodPlay } from '@lcm/db';
import { countEpisodes, nameHash, normalizeName, parsePlayUrl } from '@lcm/shared';
import { CollectClient } from '../../lib/collect/client.ts';
import { loadCategories } from '../../lib/collect/match.ts';
import { parseVodPage } from '../../lib/collect/parser.ts';
import type { CategoryInfo, MappingInfo } from '../../lib/collect/writer.ts';
import { processPage } from '../../lib/collect/writer.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';

export interface VodRouteOpts {
  db: Db;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => toInt(item)).filter((id) => id > 0))];
}

const LIMITS: Record<string, number> = {
  name: 255,
  sub_name: 255,
  area: 50,
  lang: 50,
  actor: 500,
  director: 255,
  writer: 255,
  intro: 500,
  remarks: 100,
  release_date: 20,
  cover: 255,
};

interface VodBody {
  name?: unknown;
  sub_name?: unknown;
  category_id?: unknown;
  year?: unknown;
  area?: unknown;
  lang?: unknown;
  actor?: unknown;
  director?: unknown;
  writer?: unknown;
  intro?: unknown;
  content?: unknown;
  remarks?: unknown;
  release_date?: unknown;
  cover?: unknown;
  letter?: unknown;
  episode_count?: unknown;
  status?: unknown;
}

interface VodFields {
  name: string;
  nameHash: string;
  subName: string;
  letter: string;
  cover: string;
  actor: string;
  director: string;
  writer: string;
  intro: string;
  content: string;
  remarks: string;
  releaseDate: string;
  episodeCount: number;
  area: string;
  lang: string;
  year: number;
  categoryId: number;
  categoryPid: number;
  status: number;
}

async function validateVodBody(
  db: Db,
  body: VodBody,
  vodId: number,
): Promise<{ data: VodFields } | { error: string }> {
  const name = normalizeName(toText(body.name));
  if (!name) return { error: '影片名称不能为空' };

  const text: Record<string, string> = {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    const value = key === 'name' ? name : toText((body as Record<string, unknown>)[key]);
    if (value.length > limit) return { error: `${key} 不能超过 ${limit} 个字符` };
    text[key] = value;
  }

  const categoryId = toInt(body.category_id);
  if (categoryId <= 0) return { error: '请选择分类' };
  const rows = await db
    .select({ id: category.id, pid: category.pid })
    .from(category)
    .where(eq(category.id, categoryId))
    .limit(1);
  const target = rows[0];
  if (!target) return { error: '分类不存在' };

  const year = toInt(body.year);
  if (year < 0 || year > 2999) return { error: '年份不合法' };

  const episodeCount = toInt(body.episode_count);
  if (episodeCount < 0) return { error: '总集数不合法' };

  const status = toInt(body.status, 1) === 0 ? 0 : 1;

  // 同名同年的其它影片视为重复
  const hash = nameHash(name);
  const dup = await db
    .select({ id: vod.id, year: vod.year })
    .from(vod)
    .where(eq(vod.nameHash, hash));
  const conflict = dup.find(
    (row) => row.id !== vodId && (row.year === year || row.year === 0 || year === 0),
  );
  if (conflict) return { error: '已存在同名同年的影片' };

  const rawLetter = toText(body.letter).toUpperCase();
  const letter = /^[A-Z0-9]$/.test(rawLetter) ? rawLetter : '';

  return {
    data: {
      name,
      nameHash: hash,
      subName: text.sub_name ?? '',
      letter,
      cover: text.cover ?? '',
      actor: text.actor ?? '',
      director: text.director ?? '',
      writer: text.writer ?? '',
      intro: text.intro ?? '',
      content: typeof body.content === 'string' ? body.content : '',
      remarks: text.remarks ?? '',
      releaseDate: text.release_date ?? '',
      episodeCount,
      area: text.area ?? '',
      lang: text.lang ?? '',
      year,
      categoryId: target.id,
      categoryPid: target.pid,
      status,
    },
  };
}

function parsePlayId(reply: FastifyReply, value: unknown): number {
  const id = toInt(value);
  if (id <= 0) {
    fail(reply, 400, ErrorCode.BAD_REQUEST, 'ID 不合法');
    return 0;
  }
  return id;
}

export const vodRoutes: FastifyPluginAsync<VodRouteOpts> = async (app, opts) => {
  const { db } = opts;

  /* ------------------------------- 列表 ------------------------------- */

  app.get('/', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toInt(query.page_size, 20)));

    const conditions = [];
    const categoryId = toInt(query.category_id);
    if (categoryId > 0) {
      conditions.push(or(eq(vod.categoryPid, categoryId), eq(vod.categoryId, categoryId)));
    }
    if (query.status === '0' || query.status === '1') {
      conditions.push(eq(vod.status, toInt(query.status)));
    }
    const keyword = normalizeName(toText(query.keyword));
    if (keyword) conditions.push(like(vod.name, `%${keyword}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const order = query.sort === 'new' ? desc(vod.createdAt) : desc(vod.collectedAt);

    const countRows = await db.select({ total: sql<number>`count(*)` }).from(vod).where(where);
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await db
      .select({
        id: vod.id,
        name: vod.name,
        categoryId: vod.categoryId,
        categoryPid: vod.categoryPid,
        year: vod.year,
        area: vod.area,
        lang: vod.lang,
        remarks: vod.remarks,
        status: vod.status,
        episodeCount: vod.episodeCount,
        collectedAt: vod.collectedAt,
        createdAt: vod.createdAt,
        categoryName: category.name,
      })
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
      .where(where)
      .orderBy(order, desc(vod.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const ids = rows.map((row) => row.id);
    const playCounts =
      ids.length === 0
        ? []
        : await db
            .select({
              vodId: vodPlay.vodId,
              plays: sql<number>`count(*)`,
              // 线路里实际有多少集：play_url 按 # 分隔，空串算 0 集
              episodes: sql<number>`MAX(CASE WHEN ${vodPlay.playUrl} = '' THEN 0 ELSE CHAR_LENGTH(${vodPlay.playUrl}) - CHAR_LENGTH(REPLACE(${vodPlay.playUrl}, '#', '')) + 1 END)`,
            })
            .from(vodPlay)
            .where(inArray(vodPlay.vodId, ids))
            .groupBy(vodPlay.vodId);
    const playMap = new Map(playCounts.map((row) => [row.vodId, row]));

    return ok(reply, {
      items: rows.map((row) => {
        const stat = playMap.get(row.id);
        return {
          ...row,
          playCount: stat ? Number(stat.plays) : 0,
          actualEpisodes: stat ? Number(stat.episodes) : 0,
        };
      }),
      total,
      page,
      page_size: pageSize,
    });
  });

  /* ------------------------------- 详情 ------------------------------- */

  app.get('/:id', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const rows = await db
      .select({
        id: vod.id,
        name: vod.name,
        subName: vod.subName,
        categoryId: vod.categoryId,
        categoryPid: vod.categoryPid,
        year: vod.year,
        area: vod.area,
        lang: vod.lang,
        actor: vod.actor,
        director: vod.director,
        writer: vod.writer,
        intro: vod.intro,
        content: vod.content,
        remarks: vod.remarks,
        releaseDate: vod.releaseDate,
        cover: vod.cover,
        letter: vod.letter,
        episodeCount: vod.episodeCount,
        status: vod.status,
        collectedAt: vod.collectedAt,
        createdAt: vod.createdAt,
        updatedAt: vod.updatedAt,
        categoryName: category.name,
        parentName: sql<string | null>`(
          SELECT p.name FROM lcm_category p WHERE p.id = ${vod.categoryPid}
        )`,
      })
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
      .where(eq(vod.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return fail(reply, 404, ErrorCode.NOT_FOUND, '影片不存在');

    const plays = await db
      .select({
        id: vodPlay.id,
        sourceId: vodPlay.sourceId,
        sourceName: collectSource.name,
        sourceFrom: vodPlay.sourceFrom,
        sourceVodId: vodPlay.sourceVodId,
        sourceUpdatedAt: vodPlay.sourceUpdatedAt,
        collectedAt: vodPlay.collectedAt,
        playUrl: vodPlay.playUrl,
      })
      .from(vodPlay)
      .leftJoin(collectSource, eq(collectSource.id, vodPlay.sourceId))
      .where(eq(vodPlay.vodId, id))
      .orderBy(vodPlay.id);

    return ok(reply, {
      vod: row,
      plays: plays.map((play) => ({
        ...play,
        playUrl: undefined,
        episodeCount: countEpisodes(play.playUrl),
      })),
    });
  });

  /* ------------------------------- 修改 ------------------------------- */

  app.put('/:id', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const exists = await db.select({ id: vod.id }).from(vod).where(eq(vod.id, id)).limit(1);
    if (exists.length === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '影片不存在');

    const result = await validateVodBody(db, req.body as VodBody, id);
    if ('error' in result) return fail(reply, 400, ErrorCode.BAD_REQUEST, result.error);

    await db.update(vod).set(result.data).where(eq(vod.id, id));
    return ok(reply, { id });
  });

  /* ------------------------------- 删除（下架） ------------------------------- */

  app.delete('/:id', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const exists = await db.select({ id: vod.id }).from(vod).where(eq(vod.id, id)).limit(1);
    if (exists.length === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '影片不存在');

    await db.update(vod).set({ status: 0 }).where(eq(vod.id, id));
    return ok(reply, { id });
  });

  /* ------------------------------- 批量 ------------------------------- */

  app.post('/batch', async (req, reply) => {
    const body = req.body as { ids?: unknown; action?: unknown; category_id?: unknown; status?: unknown };
    const ids = toIds(body.ids);
    if (ids.length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择影片');
    if (ids.length > 500) return fail(reply, 400, ErrorCode.BAD_REQUEST, '一次最多操作 500 条');

    const action = toText(body.action);

    if (action === 'category') {
      const categoryId = toInt(body.category_id);
      if (categoryId <= 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择目标分类');
      const rows = await db
        .select({ id: category.id, pid: category.pid })
        .from(category)
        .where(eq(category.id, categoryId))
        .limit(1);
      const target = rows[0];
      if (!target) return fail(reply, 400, ErrorCode.BAD_REQUEST, '分类不存在');
      await db
        .update(vod)
        .set({ categoryId: target.id, categoryPid: target.pid })
        .where(inArray(vod.id, ids));
      return ok(reply, { affected: ids.length });
    }

    if (action === 'status') {
      const status = toInt(body.status) === 0 ? 0 : 1;
      await db.update(vod).set({ status }).where(inArray(vod.id, ids));
      return ok(reply, { affected: ids.length });
    }

    if (action === 'delete') {
      await db.update(vod).set({ status: 0 }).where(inArray(vod.id, ids));
      return ok(reply, { affected: ids.length });
    }

    return fail(reply, 400, ErrorCode.BAD_REQUEST, '未知的批量操作');
  });

  /* ------------------------------- 重新采集 ------------------------------- */

  app.post('/:id/recollect', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const plays = await db
      .select({
        id: vodPlay.id,
        sourceId: vodPlay.sourceId,
        sourceVodId: vodPlay.sourceVodId,
      })
      .from(vodPlay)
      .where(eq(vodPlay.vodId, id));

    const asked = Number((req.body as { source_id?: unknown } | undefined)?.source_id ?? 0);
    const candidates = plays.filter((play) => play.sourceId > 0 && play.sourceVodId !== '');
    const target = asked > 0 ? candidates.find((play) => play.sourceId === asked) : candidates[0];
    if (!target) {
      return fail(
        reply,
        400,
        ErrorCode.BAD_REQUEST,
        asked > 0 ? '该影片没有来自这个采集源的线路，无法重新采集' : '该影片没有可回溯的采集来源，无法重新采集',
      );
    }

    const sources = await db
      .select()
      .from(collectSource)
      .where(eq(collectSource.id, target.sourceId))
      .limit(1);
    const source = sources[0];
    if (!source) return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集源已不存在');

    const client = new CollectClient({
      id: source.id,
      name: source.name,
      apiUrl: source.apiUrl,
      apiFormat: source.apiFormat,
      apiParams: source.apiParams,
      intervalSec: source.intervalSec,
      timeout: source.timeout,
      retryTimes: source.retryTimes,
    });

    let item;
    try {
      const raw = await client.request({ ac: 'detail', ids: target.sourceVodId, at: source.apiFormat });
      const parsed = parseVodPage(raw, source.apiFormat);
      item = parsed.list.find((row) => row.vodId === target.sourceVodId) ?? parsed.list[0];
    } catch (error) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, error instanceof Error ? error.message : '采集失败');
    }
    if (!item) return fail(reply, 400, ErrorCode.BAD_REQUEST, '源站没有返回该影片');

    // 单条处理，复用采集写库逻辑；分类按该源站分类的现有映射
    const mappingRows = await db
      .select({
        sourceTypeId: collectSourceCategory.sourceTypeId,
        categoryId: collectSourceCategory.categoryId,
        status: collectSourceCategory.status,
      })
      .from(collectSourceCategory)
      .where(
        and(
          eq(collectSourceCategory.sourceId, source.id),
          eq(collectSourceCategory.sourceTypeId, item.typeId),
        ),
      );

    const mapping = new Map<string, MappingInfo>();
    const hit = mappingRows[0];
    if (hit) mapping.set(hit.sourceTypeId, { categoryId: hit.categoryId, status: hit.status });
    if (!hit || hit.status !== 1 || hit.categoryId === 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, `该片所属源站分类（${item.typeName}）未映射，请先在分类映射里处理`);
    }

    const categories: CategoryInfo[] = await loadCategories(db);
    const categoryMap = new Map<number, CategoryInfo>(categories.map((row) => [row.id, row]));

    const result = await processPage(db, {
      sourceId: source.id,
      items: [item],
      mapping,
      categories: categoryMap,
      forceVodId: id,
      keepCollectedAt: true,
    });

    return ok(reply, {
      inserted: result.counters.inserted,
      updated: result.counters.updated,
      failed: result.counters.failed,
      fails: result.fails,
    });
  });

  /* ------------------------------- 线路 ------------------------------- */

  app.get('/:id/plays', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const rows = await db
      .select({
        id: vodPlay.id,
        sourceId: vodPlay.sourceId,
        sourceName: collectSource.name,
        sourceFrom: vodPlay.sourceFrom,
        sourceVodId: vodPlay.sourceVodId,
        sourceUpdatedAt: vodPlay.sourceUpdatedAt,
        playUrl: vodPlay.playUrl,
      })
      .from(vodPlay)
      .leftJoin(collectSource, eq(collectSource.id, vodPlay.sourceId))
      .where(eq(vodPlay.vodId, id))
      .orderBy(vodPlay.id);

    return ok(reply, {
      items: rows.map((row) => ({
        id: row.id,
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceFrom: row.sourceFrom,
        sourceVodId: row.sourceVodId,
        sourceUpdatedAt: row.sourceUpdatedAt,
        episodes: parsePlayUrl(row.playUrl),
      })),
    });
  });

  app.post('/:id/plays', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const exists = await db.select({ id: vod.id }).from(vod).where(eq(vod.id, id)).limit(1);
    if (exists.length === 0) return fail(reply, 404, ErrorCode.NOT_FOUND, '影片不存在');

    const body = req.body as { source_from?: unknown; play_url?: unknown };
    const sourceFrom = toText(body.source_from);
    if (!sourceFrom) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路名称不能为空');
    if (sourceFrom.length > 50) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路名称不能超过 50 个字符');

    const playUrl = typeof body.play_url === 'string' ? body.play_url.trim() : '';
    if (countEpisodes(playUrl) === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路里至少要有一集');

    const dup = await db
      .select({ id: vodPlay.id })
      .from(vodPlay)
      .where(and(eq(vodPlay.vodId, id), eq(vodPlay.sourceId, 0), eq(vodPlay.sourceFrom, sourceFrom)))
      .limit(1);
    if (dup.length > 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '该影片已有同名的手工线路');

    const inserted = await db
      .insert(vodPlay)
      .values({ vodId: id, sourceId: 0, sourceFrom, playUrl })
      .$returningId();

    return ok(reply, { id: inserted[0]?.id ?? 0 });
  });
};

/* ------------------------------- 单片线路操作 ------------------------------- */

export const playRoutes: FastifyPluginAsync<VodRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.put('/:id', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const rows = await db
      .select({ id: vodPlay.id, vodId: vodPlay.vodId, sourceId: vodPlay.sourceId })
      .from(vodPlay)
      .where(eq(vodPlay.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return fail(reply, 404, ErrorCode.NOT_FOUND, '线路不存在');

    const body = req.body as { source_from?: unknown; play_url?: unknown };
    const patch: { sourceFrom?: string; playUrl?: string } = {};

    if (body.source_from !== undefined) {
      const sourceFrom = toText(body.source_from);
      if (!sourceFrom) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路名称不能为空');
      if (sourceFrom.length > 50) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路名称不能超过 50 个字符');
      if (row.sourceId > 0 && sourceFrom !== '') {
        return fail(reply, 400, ErrorCode.BAD_REQUEST, '采集来的线路不能改名称');
      }
      patch.sourceFrom = sourceFrom;
    }

    if (body.play_url !== undefined) {
      const playUrl = typeof body.play_url === 'string' ? body.play_url.trim() : '';
      if (countEpisodes(playUrl) === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '线路里至少要有一集');
      patch.playUrl = playUrl;
    }

    if (Object.keys(patch).length === 0) return fail(reply, 400, ErrorCode.BAD_REQUEST, '没有要修改的内容');

    await db.update(vodPlay).set(patch).where(eq(vodPlay.id, id));
    return ok(reply, { id });
  });

  app.delete('/:id', async (req, reply) => {
    const id = parsePlayId(reply, (req.params as { id: string }).id);
    if (id === 0) return reply;

    const rows = await db
      .select({ id: vodPlay.id, vodId: vodPlay.vodId })
      .from(vodPlay)
      .where(eq(vodPlay.id, id))
      .limit(1);
    const [line] = rows;
    if (!line) return fail(reply, 404, ErrorCode.NOT_FOUND, '线路不存在');

    const countRows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(vodPlay)
      .where(eq(vodPlay.vodId, line.vodId));
    const total = Number(countRows[0]?.count ?? 0);

    // 最后一条线路需要二次确认：前端带 force=1 才真正删除
    const force = (req.query as { force?: string }).force === '1';
    if (total <= 1 && !force) {
      return reply.code(409).send({
        code: 40902,
        msg: '这是该影片的最后一条播放线路，删除后影片将没有可播放线路',
        data: { plays: total },
      });
    }

    await db.delete(vodPlay).where(eq(vodPlay.id, id));
    return ok(reply, { id });
  });
};
