import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { category, collectSource, playLine, vod, vodPlay } from '@lcm/db';
import type { Liquid } from 'liquidjs';
import { parsePlayUrl } from '@lcm/shared';
import {
  buildPagination,
  createEngine,
  loadNav,
  renderErrorPage,
  loadSiteConfig,
  parsePage,
  type NavItem,
  type Pagination,
  type SiteConfig,
} from '../../lib/theme.ts';

export interface SiteRouteOpts {
  db: Db;
}

interface VodCard {
  id: number;
  name: string;
  cover: string;
  remarks: string;
  year: number;
  area: string;
  category_name: string;
  episode_count: number;
}

interface LineView {
  id: number;
  source_id: number;
  source_from: string;
  source_name: string;
  parse_url: string;
  episode_count: number;
}

interface EpisodeView {
  index: number;
  name: string;
  url: string;
}

const toInt = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

function buildIframeUrl(parseUrl: string, url: string): string {
  if (!parseUrl) return '';
  if (parseUrl.includes('{url}')) return parseUrl.replace(/\{url\}/g, encodeURIComponent(url));
  return `${parseUrl}${url}`;
}

export const siteRoutes: FastifyPluginAsync<SiteRouteOpts> = async (app, opts) => {
  const { db } = opts;

  // 主题切换后按新主题重建引擎（字符串比较，开销可忽略）
  let engine: Liquid = createEngine('default');
  let engineTheme = 'default';
  function engineFor(theme: string): Liquid {
    if (theme !== engineTheme) {
      engine = createEngine(theme);
      engineTheme = theme;
    }
    return engine;
  }

  async function render(
    reply: FastifyReply,
    template: string,
    meta: { title: string; description: string; canonical?: string; noindex?: boolean },
    data: Record<string, unknown>,
  ): Promise<FastifyReply> {
    const config: SiteConfig = await loadSiteConfig(db);
    const nav: NavItem[] = await loadNav(db);
    const html = await engineFor(config.theme).renderFile(template, {
      ...data,
      site: config,
      nav,
      meta,
      keyword: data['keyword'] ?? '',
      nav_path: data['nav_path'] ?? '',
    });
    return reply.type('text/html; charset=utf-8').send(html);
  }

  async function notFound(reply: FastifyReply): Promise<FastifyReply> {
    return renderErrorPage(db, reply, 404, '页面不存在或已被移除');
  }

  /** 列表页取影片的基础列，只选前台用到的 */
  function vodColumns() {
    return {
      id: vod.id,
      name: vod.name,
      cover: vod.cover,
      remarks: vod.remarks,
      year: vod.year,
      area: vod.area,
      episodeCount: vod.episodeCount,
      categoryName: category.name,
    };
  }

  function toCard(row: {
    id: number;
    name: string;
    cover: string;
    remarks: string;
    year: number;
    area: string;
    episodeCount: number;
    categoryName: string | null;
  }): VodCard {
    return {
      id: row.id,
      name: row.name,
      cover: row.cover,
      remarks: row.remarks,
      year: row.year,
      area: row.area,
      category_name: row.categoryName ?? '',
      episode_count: row.episodeCount,
    };
  }

  /* ------------------------------- 首页 ------------------------------- */

  app.get('/', async (_req, reply) => {
    const config = await loadSiteConfig(db);
    const rows = await db
      .select(vodColumns())
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
      .where(eq(vod.status, 1))
      .orderBy(desc(vod.collectedAt), desc(vod.id))
      .limit(config.listPageSize);

    return render(
      reply,
      'index',
      {
        title: config.subtitle ? `${config.name} - ${config.subtitle}` : config.name,
        description: config.description,
      },
      { vods: rows.map(toCard) },
    );
  });

  /* ------------------------------- 分类列表 ------------------------------- */

  app.get('/list/:alias', async (req, reply) => {
    const { alias } = req.params as { alias: string };
    const query = req.query as Record<string, string | undefined>;
    const config = await loadSiteConfig(db);

    const parentRows = await db
      .select({ id: category.id, name: category.name, alias: category.alias })
      .from(category)
      .where(and(eq(category.alias, alias), eq(category.pid, 0)))
      .limit(1);
    const parent = parentRows[0];
    if (!parent) return notFound(reply);

    const children = await db
      .select({ id: category.id, name: category.name, alias: category.alias })
      .from(category)
      .where(and(eq(category.pid, parent.id), eq(category.isShow, 1)))
      .orderBy(category.sort, category.id);

    const typeAlias = (query.type ?? '').trim();
    const activeType = children.find((child) => child.alias === typeAlias);

    const year = toInt(query.year);
    const sort = query.sort === 'new' ? 'new' : 'time';
    const page = parsePage(query.page);

    const conditions: SQL[] = [eq(vod.status, 1)];
    if (activeType) {
      conditions.push(eq(vod.categoryId, activeType.id));
    } else {
      conditions.push(or(eq(vod.categoryPid, parent.id), eq(vod.categoryId, parent.id))!);
    }
    if (year > 0) conditions.push(eq(vod.year, year));
    const where = and(...conditions);

    const countRows = await db.select({ total: sql<number>`count(*)` }).from(vod).where(where);
    const total = Number(countRows[0]?.total ?? 0);
    const pagination = buildPagination(page, config.listPageSize, total);
    if (page > pagination.total_pages) return notFound(reply);

    const order = sort === 'new' ? [desc(vod.createdAt), desc(vod.id)] : [desc(vod.collectedAt), desc(vod.id)];
    const rows = await db
      .select(vodColumns())
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(config.listPageSize)
      .offset((page - 1) * config.listPageSize);

    // 可选年份：当前分类下出现过的年份
    const yearScope = await db
      .select({ year: vod.year })
      .from(vod)
      .where(
        and(
          eq(vod.status, 1),
          activeType
            ? eq(vod.categoryId, activeType.id)
            : or(eq(vod.categoryPid, parent.id), eq(vod.categoryId, parent.id)),
        ),
      )
      .groupBy(vod.year)
      .orderBy(desc(vod.year))
      .limit(15);
    const years = yearScope.map((row) => row.year).filter((value) => value > 0);

    const titleName = activeType ? `${activeType.name} - ${parent.name}在线观看` : `${parent.name}在线观看`;
    return render(
      reply,
      'list',
      {
        title: `${titleName} - ${config.name}`,
        description: config.description,
        canonical: `/list/${parent.alias}`,
      },
      {
        category: { id: parent.id, name: parent.name, alias: parent.alias },
        types: children.map((child) => ({ id: child.id, name: child.name, alias: child.alias })),
        vods: rows.map(toCard),
        pagination,
        filter: { type: activeType?.alias ?? '', type_name: activeType?.name ?? '', year: year > 0 ? year : '', sort },
        years,
        nav_path: parent.alias,
      },
    );
  });

  /* ------------------------------- 详情 ------------------------------- */

  async function loadLines(vodId: number): Promise<Array<LineView & { playUrl: string }>> {
    const rows = await db
      .select({
        id: vodPlay.id,
        sourceId: vodPlay.sourceId,
        sourceFrom: vodPlay.sourceFrom,
        playUrl: vodPlay.playUrl,
        sourceName: collectSource.name,
        parseUrl: collectSource.parseUrl,
        lineName: playLine.name,
        lineSort: playLine.sort,
        lineEnabled: playLine.isEnabled,
      })
      .from(vodPlay)
      .leftJoin(collectSource, eq(collectSource.id, vodPlay.sourceId))
      .leftJoin(playLine, eq(playLine.sourceFrom, vodPlay.sourceFrom))
      .where(eq(vodPlay.vodId, vodId));

    return rows
      .filter((row) => row.lineEnabled !== 0)
      .sort((a, b) => (a.lineSort ?? 0) - (b.lineSort ?? 0) || a.id - b.id)
      .map((row) => ({
        id: row.id,
        source_id: row.sourceId,
        source_from: row.sourceFrom,
        source_name:
          row.lineName ||
          (row.sourceId === 0 ? row.sourceFrom : row.sourceName) ||
          '默认线路',
        parse_url: row.parseUrl ?? '',
        episode_count: parsePlayUrl(row.playUrl).length,
        playUrl: row.playUrl,
      }));
  }

  app.get('/detail/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    if (id <= 0) return notFound(reply);

    const config = await loadSiteConfig(db);
    const rows = await db
      .select({
        id: vod.id,
        name: vod.name,
        subName: vod.subName,
        cover: vod.cover,
        remarks: vod.remarks,
        year: vod.year,
        area: vod.area,
        lang: vod.lang,
        actor: vod.actor,
        director: vod.director,
        writer: vod.writer,
        intro: vod.intro,
        content: vod.content,
        releaseDate: vod.releaseDate,
        episodeCount: vod.episodeCount,
        collectedAt: vod.collectedAt,
        categoryId: vod.categoryId,
        categoryPid: vod.categoryPid,
        categoryName: category.name,
        categoryAlias: category.alias,
      })
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
      .where(and(eq(vod.id, id), eq(vod.status, 1)))
      .limit(1);

    const row = rows[0];
    if (!row) return notFound(reply);

    const parentRows = row.categoryPid
      ? await db
          .select({ id: category.id, name: category.name, alias: category.alias })
          .from(category)
          .where(eq(category.id, row.categoryPid))
          .limit(1)
      : [];
    const parent = parentRows[0];

    const lines = await loadLines(id);
    const firstLine = lines[0];
    const allEpisodes = firstLine ? parsePlayUrl(firstLine.playUrl) : [];
    const episodes: EpisodeView[] = allEpisodes.slice(0, 50).map((item, index) => ({
      index: index + 1,
      name: item.name,
      url: item.url,
    }));

    return render(
      reply,
      'detail',
      {
        title: `${row.name} - ${row.categoryName ?? ''} - ${config.name}`,
        description: (row.intro || config.description).slice(0, 120),
        canonical: `/detail/${row.id}`,
      },
      {
        vod: {
          id: row.id,
          name: row.name,
          sub_name: row.subName,
          cover: row.cover,
          remarks: row.remarks,
          year: row.year,
          area: row.area,
          lang: row.lang,
          actor: row.actor,
          director: row.director,
          writer: row.writer,
          intro: row.intro,
          content: row.content ?? '',
          release_date: row.releaseDate,
          episode_count: row.episodeCount,
          collected_at: row.collectedAt,
          category_id: row.categoryId,
          category_name: row.categoryName ?? '',
          category_alias: row.categoryAlias ?? '',
          category_pid: row.categoryPid,
          parent_name: parent?.name ?? '',
          parent_alias: parent?.alias ?? '',
        },
        lines: lines.map((item) => ({
          id: item.id,
          name: item.source_name,
          source_from: item.source_from,
          episode_count: item.episode_count,
        })),
        episodes,
        current_line: firstLine
          ? { id: firstLine.id, name: firstLine.source_name, episode_count: allEpisodes.length }
          : null,
        nav_path: parent?.alias ?? '',
      },
    );
  });

  /* ------------------------------- 播放 ------------------------------- */

  async function renderPlay(
    reply: FastifyReply,
    id: number,
    playId: number,
    ep: number,
    page: number,
  ): Promise<FastifyReply> {
    const config = await loadSiteConfig(db);
    const rows = await db
      .select({ id: vod.id, name: vod.name, cover: vod.cover, remarks: vod.remarks })
      .from(vod)
      .where(and(eq(vod.id, id), eq(vod.status, 1)))
      .limit(1);
    const row = rows[0];
    if (!row) return notFound(reply);

    const lines = await loadLines(id);
    if (lines.length === 0) return notFound(reply);

    const line = playId > 0 ? lines.find((item) => item.id === playId) : lines[0];
    if (!line) return notFound(reply);

    const all = parsePlayUrl(line.playUrl);
    if (all.length === 0) return notFound(reply);

    const currentEp = ep > 0 ? ep : 1;
    if (currentEp > all.length) return notFound(reply);

    const current = all[currentEp - 1];
    if (!current) return notFound(reply);

    const episodes: EpisodeView[] = all.map((item, index) => ({ index: index + 1, name: item.name, url: item.url }));
    const pagination: Pagination = buildPagination(page, 50, episodes.length);
    if (page > pagination.total_pages) return notFound(reply);
    const pageEpisodes = episodes.slice((page - 1) * 50, page * 50);

    const iframeUrl = buildIframeUrl(line.parse_url, current.url);
    const episodeName = current.name || `第 ${currentEp} 集`;

    return render(
      reply,
      'play',
      {
        title: `${row.name} ${episodeName} - ${line.source_name} - ${config.name}`,
        description: config.description,
        canonical: `/play/${row.id}/${line.id}/${currentEp}`,
      },
      {
        vod: { id: row.id, name: row.name, cover: row.cover, remarks: row.remarks },
        line: { id: line.id, name: line.source_name, parse_url: line.parse_url, episode_count: all.length },
        lines: lines.map((item) => ({ id: item.id, name: item.source_name, episode_count: item.episode_count })),
        episodes: pageEpisodes,
        current_ep: currentEp,
        current_ep_name: episodeName,
        play_url: current.url,
        is_hls: /\.m3u8(\?|$)/i.test(current.url),
        player: config.player,
        autoplay: config.autoplay,
        autonext: config.autonext,
        resume: config.resume,
        volume: config.volume,
        muted: config.muted,
        hotkey: config.hotkey,
        screenshot: config.screenshot,
        pip: config.pip,
        webfullscreen: config.webfullscreen,
        setting: config.setting,
        loop: config.loop,
        next_url: currentEp < all.length ? `/play/${row.id}/${line.id}/${currentEp + 1}` : '',
        prev_url: currentEp > 1 ? `/play/${row.id}/${line.id}/${currentEp - 1}` : '',
        pagination,
        iframe_url: iframeUrl,
      },
    );
  }

  app.get('/play/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    if (id <= 0) return notFound(reply);
    return renderPlay(reply, id, 0, 0, 1);
  });

  app.get('/play/:id/:playId', async (req, reply) => {
    const { id, playId } = req.params as { id: string; playId: string };
    const vodId = toInt(id);
    if (vodId <= 0) return notFound(reply);
    return renderPlay(reply, vodId, toInt(playId), 0, 1);
  });

  app.get('/play/:id/:playId/:ep', async (req, reply) => {
    const { id, playId, ep } = req.params as { id: string; playId: string; ep: string };
    const query = req.query as Record<string, string | undefined>;
    const vodId = toInt(id);
    if (vodId <= 0) return notFound(reply);
    return renderPlay(reply, vodId, toInt(playId), toInt(ep), parsePage(query.page));
  });

  /* ------------------------------- 搜索 ------------------------------- */

  app.get('/search', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const config = await loadSiteConfig(db);
    const keyword = (query.wd ?? '').trim().slice(0, 50);
    const page = parsePage(query.page);

    if (!keyword) {
      return render(
        reply,
        'search',
        { title: `搜索： - ${config.name}`, description: config.description, noindex: true },
        { keyword: '', vods: [], pagination: buildPagination(1, config.listPageSize, 0) },
      );
    }

    const where = and(eq(vod.status, 1), like(vod.name, `%${keyword}%`));
    const countRows = await db.select({ total: sql<number>`count(*)` }).from(vod).where(where);
    const total = Number(countRows[0]?.total ?? 0);
    const pagination = buildPagination(page, config.listPageSize, total);
    if (page > pagination.total_pages) return notFound(reply);

    const rows = await db
      .select(vodColumns())
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
      .where(where)
      .orderBy(desc(vod.collectedAt), desc(vod.id))
      .limit(config.listPageSize)
      .offset((page - 1) * config.listPageSize);

    return render(
      reply,
      'search',
      { title: `搜索：${keyword} - ${config.name}`, description: config.description, noindex: true },
      { keyword, vods: rows.map(toCard), pagination, filter: { wd: keyword } },
    );
  });
};
