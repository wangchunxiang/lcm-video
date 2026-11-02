import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { and, desc, eq, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { adFeature, category, collectSource, playLine, vod, vodPlay } from '@lcm/db';
import type { Liquid } from 'liquidjs';
import { episodeLabel, episodeSpan, parsePlayUrl } from '@lcm/shared';
import { cleanPlaylist } from '../../lib/ads/skip.ts';
import {
  buildPagination,
  createEngine,
  isMobileRequest,
  loadCategories,
  loadNav,
  pickTemplate,
  renderErrorPage,
  loadSiteConfig,
  parsePage,
  type NavItem,
  type Pagination,
  type SiteConfig,
} from '../../lib/theme.ts';

/** 首页最新更新的条数：一行 8 个，正好两行 */
const HOME_VOD_COUNT = 16;
/** 首页每个一级分类展示的条数：一行 8 个 */
const HOME_CATEGORY_COUNT = 16;

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
  /** 标签占格：1 一格、2 两格、3 整行 */
  width: 1 | 2 | 3;
}

/** 分页页码列表：页数多时用省略号收敛，形如 [1,'gap',8,9,10,'gap',62] */

const toInt = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

function buildIframeUrl(parseUrl: string, url: string): string {
  if (!parseUrl) return '';
  if (parseUrl.includes('{url}')) return parseUrl.replace(/\{url\}/g, encodeURIComponent(url));
  return `${parseUrl}${url}`;
}

/**
 * 分类页的统计与年份：一级分类用两条单条件查询并行，避免 `OR` 导致索引失效。
 * 年份结果按分类缓存 60 秒——采集后新出现的年份最多晚一分钟展示，可接受。
 */
async function countByParent(db: Db, categoryId: number, year: number): Promise<number> {
  const yearCond = year > 0 ? eq(vod.year, year) : undefined;
  const [byId, byPid] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(vod)
      .where(and(eq(vod.status, 1), eq(vod.categoryId, categoryId), yearCond)),
    db
      .select({ total: sql<number>`count(*)` })
      .from(vod)
      .where(and(eq(vod.status, 1), eq(vod.categoryPid, categoryId), yearCond)),
  ]);
  return Number(byId[0]?.total ?? 0) + Number(byPid[0]?.total ?? 0);
}

/** 单条件计数，配合 Promise.all 与其他查询并行发出 */
async function countWhere(db: Db, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(vod).where(where);
  return Number(row?.total ?? 0);
}

const yearCache = new Map<string, { at: number; years: number[] }>();

async function loadYears(db: Db, categoryId: number, scope: 'parent' | 'type'): Promise<number[]> {
  const key = `${scope}:${categoryId}`;
  const hit = yearCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.years;

  const base = [
    eq(vod.status, 1),
    sql`${vod.year} > 0`,
    lte(vod.year, sql`YEAR(NOW())`),
  ];
  const pick = (rows: Array<{ year: number }>) => rows.map((row) => row.year);

  let years: number[];
  if (scope === 'type') {
    const rows = await db
      .select({ year: vod.year })
      .from(vod)
      .where(and(...base, eq(vod.categoryId, categoryId)))
      .groupBy(vod.year)
      .orderBy(desc(vod.year))
      .limit(15);
    years = pick(rows);
  } else {
    const [byPid, byId] = await Promise.all([
      db
        .select({ year: vod.year })
        .from(vod)
        .where(and(...base, eq(vod.categoryPid, categoryId)))
        .groupBy(vod.year)
        .orderBy(desc(vod.year))
        .limit(15),
      db
        .select({ year: vod.year })
        .from(vod)
        .where(and(...base, eq(vod.categoryId, categoryId)))
        .groupBy(vod.year)
        .orderBy(desc(vod.year))
        .limit(15),
    ]);
    years = [...new Set([...pick(byPid), ...pick(byId)])].sort((a, b) => b - a).slice(0, 15);
  }

  yearCache.set(key, { at: Date.now(), years });
  return years;
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
    // 手机走 mobile/ 下的模板，桌面走根目录；同一 URL 两种 HTML，靠 Vary 区分缓存
    const mobile = isMobileRequest(reply.request.headers);
    const html = await engineFor(config.theme).renderFile(pickTemplate(config.theme, template, mobile), {
      ...data,
      site: config,
      nav,
      meta,
      keyword: data['keyword'] ?? '',
      nav_path: data['nav_path'] ?? '',
    });
    return reply
      .header('vary', 'User-Agent, Sec-CH-UA-Mobile')
      .type('text/html; charset=utf-8')
      .send(html);
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
    // 首页要查的东西彼此独立，全部并行发出，避免串行累加往返时间
    const [config, rows, todayRows, nav] = await Promise.all([
      loadSiteConfig(db),
      db
        .select(vodColumns())
        .from(vod)
        .leftJoin(category, eq(category.id, vod.categoryId))
        .where(eq(vod.status, 1))
        .orderBy(desc(vod.collectedAt), desc(vod.id))
        .limit(HOME_VOD_COUNT),
      db
        .select({ total: sql<number>`count(*)` })
        .from(vod)
        .where(and(eq(vod.status, 1), sql`${vod.collectedAt} >= CURDATE()`)),
      loadNav(db),
    ]);
    const todayCount = Number(todayRows[0]?.total ?? 0);

    // 每个一级分类各取最新 N 条，同样并行
    const sections = await Promise.all(
      nav.map(async (item) => ({
        item,
        list: await db
          .select(vodColumns())
          .from(vod)
          .leftJoin(category, eq(category.id, vod.categoryId))
          .where(
            and(
              eq(vod.status, 1),
              or(eq(vod.categoryPid, item.id), eq(vod.categoryId, item.id)),
            ),
          )
          .orderBy(desc(vod.collectedAt), desc(vod.id))
          .limit(HOME_CATEGORY_COUNT),
      })),
    );
    const homeCategories: Array<{ name: string; alias: string; vods: VodCard[] }> = [];
    for (const { item, list } of sections) {
      if (list.length === 0) continue;
      homeCategories.push({ name: item.name, alias: item.alias, vods: list.map(toCard) });
    }

    return render(
      reply,
      'index',
      {
        title: config.subtitle ? `${config.name} - ${config.subtitle}` : config.name,
        description: config.description,
      },
      { vods: rows.map(toCard), home_categories: homeCategories, today_count: todayCount },
    );
  });

  /* ------------------------------- 分类列表 ------------------------------- */

  app.get('/list/:alias', async (req, reply) => {
    const { alias } = req.params as { alias: string };
    const query = req.query as Record<string, string | undefined>;
    const config = await loadSiteConfig(db);

    // 分类整表已在内存里缓存 60 秒，父级与子级都在本地筛，省掉两次库往返
    const categories = await loadCategories(db);
    const parent = categories.find((row) => row.pid === 0 && row.alias === alias);
    if (!parent) return notFound(reply);

    const children = categories.filter((row) => row.pid === parent.id && row.isShow === 1);

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

    // 一级分类页的「父分类 OR 子分类」会让优化器放弃分类索引、退化成全表扫，
    // 这里拆成两条单条件查询并行执行，各自都能走索引。
    // 总数、列表、年份三件事互不依赖，一次并行发出，只等一个往返。
    const order = sort === 'new' ? [desc(vod.createdAt), desc(vod.id)] : [desc(vod.collectedAt), desc(vod.id)];
    const [total, rows, years] = await Promise.all([
      activeType ? countWhere(db, where) : countByParent(db, parent.id, year),
      db
        .select(vodColumns())
        .from(vod)
        .leftJoin(category, eq(category.id, vod.categoryId))
        .where(where)
        .orderBy(...order)
        .limit(config.listPageSize)
        .offset((page - 1) * config.listPageSize),
      loadYears(db, activeType ? activeType.id : parent.id, activeType ? 'type' : 'parent'),
    ]);
    const pagination = buildPagination(page, config.listPageSize, total);
    if (page > pagination.total_pages) return notFound(reply);

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
    const query = req.query as { line?: string; ep?: string };
    const wantedLineId = toInt(query.line);
    const currentLine = lines.find((item) => item.id === wantedLineId) ?? lines[0];
    const allEpisodes = currentLine ? parsePlayUrl(currentLine.playUrl) : [];
    const lineTabs = lines.map((item) => {
      const eps = parsePlayUrl(item.playUrl);
      return {
        id: item.id,
        name: item.source_name,
        total: eps.length,
        episodes: eps.map((ep, index) => {
          const label = episodeLabel(ep, index);
          return { index: index + 1, name: ep.name, url: ep.url, width: episodeSpan(label) };
        }),
      };
    });
    const currentLineId = currentLine?.id ?? 0;
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
        line_tabs: lineTabs,
        current_line_id: currentLineId,
        current_line: currentLine
          ? { id: currentLine.id, name: currentLine.source_name, episode_count: allEpisodes.length }
          : null,
        nav_path: parent?.alias ?? '',
      },
    );
  });

  /* ------------------------------- 播放 ------------------------------- */

  async function renderPlay(reply: FastifyReply, id: number, playId: number, ep: number): Promise<FastifyReply> {
    const config = await loadSiteConfig(db);
    const rows = await db
      .select({
        id: vod.id,
        name: vod.name,
        cover: vod.cover,
        remarks: vod.remarks,
        year: vod.year,
        area: vod.area,
        actor: vod.actor,
        director: vod.director,
        intro: vod.intro,
        category_name: category.name,
      })
      .from(vod)
      .leftJoin(category, eq(category.id, vod.categoryId))
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

    const isHls = /\.m3u8(\?|$)/i.test(current.url);
    const adRows =
      line.source_id > 0 && !line.parse_url && isHls
        ? await db
            .select({ id: adFeature.id })
            .from(adFeature)
            .where(eq(adFeature.sourceId, line.source_id))
            .limit(1)
        : [];
    const proxyPlayUrl = adRows.length > 0 ? `/play/ad/${row.id}/${line.id}/${currentEp}` : '';

    const episodes: EpisodeView[] = all.map((item, index) => ({
      index: index + 1,
      name: item.name,
      url: item.url,
      width: episodeSpan(item.name || `第 ${index + 1} 集`),
    }));

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
        vod: {
          id: row.id,
          name: row.name,
          cover: row.cover,
          remarks: row.remarks,
          year: row.year,
          area: row.area,
          actor: row.actor,
          director: row.director,
          intro: row.intro,
          category_name: row.category_name ?? '',
        },
        line: { id: line.id, name: line.source_name, parse_url: line.parse_url, episode_count: all.length },
        lines: lines.map((item) => ({
          id: item.id,
          name: item.source_name,
          episode_count: item.episode_count,
          // 换线路时保持当前集数，超出该线路集数则退到最后一集
          ep: Math.max(1, Math.min(currentEp, item.episode_count)),
        })),
        episodes,
        current_ep: currentEp,
        current_ep_name: episodeName,
        play_url: proxyPlayUrl || current.url,
        is_hls: isHls,
        autoplay: config.autoplay,
        autonext: config.autonext,
        resume: config.resume,
        screenshot: config.screenshot,
        webfullscreen: config.webfullscreen,
        fullscreen: config.fullscreen,
        setting: config.setting,
        next_url: currentEp < all.length ? `/play/${row.id}/${line.id}/${currentEp + 1}` : '',
        prev_url: currentEp > 1 ? `/play/${row.id}/${line.id}/${currentEp - 1}` : '',
        iframe_url: iframeUrl,
      },
    );
  }

  app.get('/play/:id', async (req, reply) => {
    const id = toInt((req.params as { id: string }).id);
    if (id <= 0) return notFound(reply);
    return renderPlay(reply, id, 0, 1);
  });

  app.get('/play/:id/:playId', async (req, reply) => {
    const { id, playId } = req.params as { id: string; playId: string };
    const vodId = toInt(id);
    if (vodId <= 0) return notFound(reply);
    return renderPlay(reply, vodId, toInt(playId), 1);
  });

  app.get('/play/ad/:id/:playId/:ep', async (req, reply) => {
    const { id, playId, ep } = req.params as { id: string; playId: string; ep: string };
    const vodId = toInt(id);
    const lineId = toInt(playId);
    const epIndex = toInt(ep);
    if (vodId <= 0 || lineId <= 0 || epIndex <= 0) return notFound(reply);

    const lines = await loadLines(vodId);
    const line = lines.find((item) => item.id === lineId);
    if (!line) return notFound(reply);

    const current = parsePlayUrl(line.playUrl)[epIndex - 1];
    if (!current) return notFound(reply);

    try {
      const cleaned = await cleanPlaylist(db, line.source_id, current.url);
      if (!cleaned) return reply.redirect(current.url, 302);
      return reply
        .header('content-type', 'application/vnd.apple.mpegurl')
        .header('cache-control', 'no-cache')
        .send(cleaned.text);
    } catch {
      return reply.redirect(current.url, 302);
    }
  });

  app.get('/play/:id/:playId/:ep', async (req, reply) => {
    const { id, playId, ep } = req.params as { id: string; playId: string; ep: string };
    const vodId = toInt(id);
    if (vodId <= 0) return notFound(reply);
    return renderPlay(reply, vodId, toInt(playId), toInt(ep));
  });

  /* ------------------------------- 搜索 ------------------------------- */

  app.get('/search', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const config = await loadSiteConfig(db);
    const keyword = (query.wd ?? '').trim().slice(0, 50);
    const page = parsePage(query.page);
    const year = toInt(query.year);
    const sort = query.sort === 'new' ? 'new' : 'time';

    if (!keyword) {
      return render(
        reply,
        'search',
        { title: `搜索： - ${config.name}`, description: config.description, noindex: true },
        {
          keyword: '',
          vods: [],
          pagination: buildPagination(1, config.listPageSize, 0),
          years: [],
          filter: { wd: '', year: '', sort },
        },
      );
    }

    // 关键字匹配走覆盖索引 idx_search：一次索引扫描就拿到全部命中的 id、年份和两个时间，
    // 总数、可选年份、排序都在内存里算，不再为同一个词扫三遍表。
    const pattern = `%${keyword.replace(/[\%_]/g, (ch) => `\${ch}`)}%`;
    const conditions: SQL[] = [eq(vod.status, 1), like(vod.name, pattern)];
    if (year > 0) conditions.push(eq(vod.year, year));
    const hits = await db
      .select({ id: vod.id, year: vod.year, collectedAt: vod.collectedAt, createdAt: vod.createdAt })
      .from(vod)
      .where(and(...conditions));

    const total = hits.length;
    const pagination = buildPagination(page, config.listPageSize, total);
    if (page > pagination.total_pages) return notFound(reply);

    const maxYear = new Date().getFullYear();
    const years = [...new Set(hits.map((hit) => Number(hit.year)).filter((value) => value > 0 && value <= maxYear))]
      .sort((a, b) => b - a)
      .slice(0, 15);

    const timeOf = (value: Date | null): number => (value ? new Date(value).getTime() : 0);
    hits.sort((a, b) =>
      sort === 'new'
        ? timeOf(b.createdAt) - timeOf(a.createdAt) || b.id - a.id
        : timeOf(b.collectedAt) - timeOf(a.collectedAt) || b.id - a.id,
    );

    const pageIds = hits.slice((page - 1) * config.listPageSize, page * config.listPageSize).map((hit) => hit.id);
    const pageRows =
      pageIds.length === 0
        ? []
        : await db
            .select(vodColumns())
            .from(vod)
            .leftJoin(category, eq(category.id, vod.categoryId))
            .where(inArray(vod.id, pageIds));
    const byId = new Map(pageRows.map((row) => [row.id, row]));
    const rows = pageIds
      .map((id) => byId.get(id))
      .filter((row): row is (typeof pageRows)[number] => row !== undefined);

    return render(
      reply,
      'search',
      { title: `搜索：${keyword} - ${config.name}`, description: config.description, noindex: true },
      {
        keyword,
        vods: rows.map(toCard),
        pagination,
        years,
        filter: { wd: keyword, year: year > 0 ? year : '', sort },
      },
    );
  });
};
