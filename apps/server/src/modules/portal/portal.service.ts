import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { compareId, countEpisodes, escapeLike, parsePlayUrl } from '@lcm/shared';
import { SettingService } from '../setting/setting.service';


/** 卡片：列表/首页统一的最小影片信息。 */
export interface VodCard {
  id: string;
  name: string;
  subName: string;
  cover: string;
  year: number;
  area: string;
  remarks: string;
  episodeCount: number;
  categoryId: string;
  categoryName: string;
}

/**
 * 卡片查询的列：列表、首页、搜索共用一份，避免各处列名漂移。
 * 搜索走两段式（先 id 再取宽字段），也复用这段 SELECT。
 */
const CARD_SELECT = `SELECT v.id, v.name, v.sub_name AS subName, v.cover, v.year, v.area, v.remarks,
        v.episode_count AS episodeCount, v.category_id AS categoryId,
        COALESCE(c.name, '') AS categoryName
   FROM lcm_vod v LEFT JOIN lcm_category c ON c.id = v.category_id`;

interface CardRow {
  id: string;
  name: string;
  subName: string;
  cover: string;
  year: number;
  area: string;
  remarks: string;
  episodeCount: number;
  categoryId: string;
  categoryName: string;
}

function toCard(row: CardRow): VodCard {
  return {
    id: String(row.id),
    name: row.name,
    subName: row.subName,
    cover: row.cover,
    year: Number(row.year),
    area: row.area,
    remarks: row.remarks,
    episodeCount: Number(row.episodeCount),
    categoryId: row.categoryId,
    categoryName: row.categoryName,
  };
}

/** 一级分类（带子分类）。 */
export interface CategoryNode {
  id: string;
  name: string;
  alias: string;
  children: Array<{ id: string; name: string; alias: string }>;
}

/** 播放线路。 */
export interface PlayLine {
  /** `lcm_vod_play.id`，播放页 URL 用它定位线路 */
  id: string;
  sourceId: string;
  sourceFrom: string;
  name: string;
  episodes: number;
  /** 采集源的解析接口；空串表示直链播放 */
  parseUrl: string;
}

/** 一行卡片（首页分区）。 */
export interface VodRow {
  title: string;
  /** 「更多」跳转地址；没有对应聚合页的区块不填 */
  more?: string;
  items: VodCard[];
}

/** 播放页的集：在共享 Episode 的基础上带 1 基序号。 */
export interface EpisodeItem {
  index: number;
  name: string;
  url: string;
}

/** 前台公开配置：站点信息 + 播放器开关。 */
export interface SiteConfig {
  siteName: string;
  siteSubtitle: string;
  siteDisclaimer: string;
  siteStatsCode: string;
  listPageSize: number;
  player: {
    autoplay: boolean;
    autonext: boolean;
    resume: boolean;
    screenshot: boolean;
    fullscreen: boolean;
    webfullscreen: boolean;
    setting: boolean;
  };
}

const PAGE_LIMIT = 100;
/** 首页每块给 8 列 × 2 行 = 16 部（前台首页按 16 部一屏两行排） */
const HOME_ROW = 16;

/** 取正整数参数，非法时回落默认值。 */
function toInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * 前台只读接口：首页、列表、详情、播放、搜索。
 * 全部公开（控制器上标 `@Public()`），不写库。
 */
@Injectable()
export class PortalService {
  /** 年份选项缓存：全站同一份，列表页每次请求都会要，60 秒内不重复查库。 */
  private yearsCache: { at: number; years: number[] } | null = null;

  /** 一级分类总数缓存：key = `分类id:年份`，翻页/切排序时不必重复计数。 */
  private readonly countCache = new Map<string, { at: number; total: number }>();

  private static readonly YEARS_TTL_MS = 60_000;

  private static readonly COUNT_TTL_MS = 60_000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly setting: SettingService,
  ) {}

  /** 前台公开配置：站点信息 + 播放器开关。后台配置项不在这里暴露。 */
  async config(): Promise<SiteConfig> {
    const [
      siteName,
      siteSubtitle,
      siteDisclaimer,
      siteStatsCode,
      listPageSize,
      autoplay,
      autonext,
      resume,
      screenshot,
      fullscreen,
      webfullscreen,
      setting,
    ] = await Promise.all([
      this.setting.get('site_name', '蓝草莓影视'),
      this.setting.get('site_subtitle', '高清影视在线观看'),
      this.setting.get('site_disclaimer', ''),
      this.setting.get('site_stats_code', ''),
      this.setting.number('list_page_size', 24),
      this.setting.flag('player_autoplay', false),
      this.setting.flag('player_autonext', true),
      this.setting.flag('player_resume', true),
      this.setting.flag('player_screenshot', true),
      this.setting.flag('player_fullscreen', true),
      this.setting.flag('player_webfullscreen', false),
      this.setting.flag('player_setting', true),
    ]);

    return {
      siteName,
      siteSubtitle,
      siteDisclaimer,
      siteStatsCode,
      listPageSize: Math.min(60, Math.max(12, listPageSize)),
      player: { autoplay, autonext, resume, screenshot, fullscreen, webfullscreen, setting },
    };
  }

  /** 首页：分类树 + 今日更新。 */
  async home(): Promise<{ categories: CategoryNode[]; rows: VodRow[] }> {
    const [categories, today] = await Promise.all([
      this.categories(),
      this.queryCards({
        where: 'v.status = 1 AND v.collected_at >= CURDATE()',
        order: 'v.collected_at DESC, v.id DESC',
        take: HOME_ROW,
      }),
    ]);

    const rows: VodRow[] = [{ title: '今日更新', items: today }].filter(
      (row) => row.items.length > 0,
    );

    return { categories, rows };
  }

  /** 分类树：一级 + 其下二级。 */
  async categories(): Promise<CategoryNode[]> {
    const rows = await this.dataSource.query<
      Array<{ id: string; pid: string; name: string; alias: string }>
    >(
      'SELECT id, pid, name, alias FROM lcm_category WHERE is_show = 1 ORDER BY sort ASC, id ASC',
    );
    const tops = rows.filter((row) => row.pid === '0');
    return tops.map((top) => ({
      id: top.id,
      name: top.name,
      alias: top.alias,
      children: rows
        .filter((row) => row.pid === top.id)
        .map((child) => ({ id: child.id, name: child.name, alias: child.alias })),
    }));
  }

  /** 列表页：按分类别名分页，带年份与子分类筛选项。 */
  async list(input: {
    alias: string;
    typeAlias?: string;
    year?: string;
    sort?: string;
    take?: string;
    skip?: string;
  }): Promise<{
    category: { id: string; name: string; alias: string; pid: string };
    types: Array<{ id: string; name: string; alias: string }>;
    years: number[];
    items: VodCard[];
    total: number;
  }> {
    const take = toInt(input.take, 24, 1, PAGE_LIMIT);
    const skip = toInt(input.skip, 0, 0, 1_000_000);

    // 只认真实分类：没有「全部」聚合页，未知别名一律 404
    const category = (
      await this.dataSource.query<Array<{ id: string; name: string; alias: string; pid: string }>>(
        'SELECT id, pid, name, alias FROM lcm_category WHERE alias = ? LIMIT 1',
        [input.alias],
      )
    )[0] ?? null;
    if (category === null) throw new NotFoundException('分类不存在');

    const types = await this.dataSource.query<Array<{ id: string; name: string; alias: string }>>(
      'SELECT id, name, alias FROM lcm_category WHERE pid = ? ORDER BY sort ASC, id ASC',
      [category.pid === '0' ? category.id : category.pid],
    );

    const clauses: string[] = ['v.status = 1'];
    const params: unknown[] = [];
    const sub =
      input.typeAlias !== undefined && input.typeAlias !== ''
        ? (types.find((row) => row.alias === input.typeAlias) ?? null)
        : null;
    if (input.typeAlias !== undefined && input.typeAlias !== '' && sub === null) {
      throw new BadRequestException('子分类不存在');
    }
    // 一级分类且没选子分类时，范围是「分类本身 + 其下所有子分类」
    const topLevel = category.pid === '0' && sub === null;
    if (sub !== null) {
      clauses.push('v.category_id = ?');
      params.push(sub.id);
    } else if (category.pid === '0') {
      clauses.push('(v.category_id = ? OR v.category_pid = ?)');
      params.push(category.id, category.id);
    } else {
      clauses.push('v.category_id = ?');
      params.push(category.id);
    }
    const year = Number(input.year ?? '');
    const yearFilter = Number.isFinite(year) && year > 0 ? year : undefined;
    if (yearFilter !== undefined) {
      clauses.push('v.year = ?');
      params.push(yearFilter);
    }

    const where = clauses.join(' AND ');
    // 排序沿用老站：`new` 按收录时间（created_at），其余按采集时间（collected_at）
    const order =
      input.sort === 'new' ? 'v.created_at DESC, v.id DESC' : 'v.collected_at DESC, v.id DESC';

    const [items, total, years] = await Promise.all([
      this.queryCards({ where, order, take, skip, params }),
      topLevel
        ? this.countTopLevel(category.id, yearFilter)
        : this.countByWhere(where, params),
      this.listYears(),
    ]);

    return {
      category,
      types,
      years,
      items,
      total,
    };
  }

  /** 普通计数：条件都带索引前缀，直接 COUNT 即可。 */
  private async countByWhere(where: string, params: unknown[]): Promise<number> {
    const rows = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM lcm_vod v WHERE ${where}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * 一级分类的计数：不能对 `(category_id = ? OR category_pid = ?)` 直接 COUNT(*)
   * —— MySQL 会放弃索引走全表扫（12 万行实测 2.3~2.7 秒）。
   * 拆成两段互不重叠的索引计数再相加（第二段排除已被第一段覆盖的行），实测 100ms 左右。
   * 结果缓存 60 秒：列表页翻页、切排序都会重复问同一个数，采集入库晚一分钟显示无所谓。
   */
  private async countTopLevel(categoryId: string, year?: number): Promise<number> {
    const key = `${categoryId}:${year ?? ''}`;
    const now = Date.now();
    const hit = this.countCache.get(key);
    if (hit !== undefined && now - hit.at < PortalService.COUNT_TTL_MS) return hit.total;

    const filter = year === undefined ? '' : ' AND year = ?';
    const extra: unknown[] = year === undefined ? [] : [year];
    const rows = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT
         (SELECT COUNT(*) FROM lcm_vod WHERE status = 1${filter} AND category_pid = ?) +
         (SELECT COUNT(*) FROM lcm_vod WHERE status = 1${filter} AND category_id = ? AND category_pid <> ?) AS total`,
      [...extra, categoryId, ...extra, categoryId, categoryId],
    );
    const total = Number(rows[0]?.total ?? 0);
    this.countCache.set(key, { at: now, total });
    return total;
  }

  /**
   * 年份筛选选项：全站同一份，改库不频繁，缓存 60 秒。
   * 旧库里有 826 条年份是 201717、22026 这类脏值，还有若干未来年份，只列 1900 到今年。
   */
  private async listYears(): Promise<number[]> {
    const now = Date.now();
    if (this.yearsCache !== null && now - this.yearsCache.at < PortalService.YEARS_TTL_MS) {
      return this.yearsCache.years;
    }
    const rows = await this.dataSource.query<Array<{ year: number }>>(
      'SELECT DISTINCT year FROM lcm_vod WHERE status = 1 AND year BETWEEN 1900 AND ? ORDER BY year DESC LIMIT 15',
      [new Date().getFullYear()],
    );
    const years = rows.map((row) => Number(row.year));
    this.yearsCache = { at: now, years };
    return years;
  }

  /** 详情页：影片 + 线路（按线路设置排序过滤）+ 同分类推荐。 */
  async detail(id: string): Promise<{
    vod: VodCard & { content: string; actor: string; director: string; releaseDate: string; lang: string };
    lines: PlayLine[];
    related: VodCard[];
  }> {
    const rows = await this.dataSource.query<
      Array<
        VodCard & {
          content: string;
          actor: string;
          director: string;
          releaseDate: string;
          lang: string;
          status: number;
        }
      >
    >(
      `SELECT v.id, v.name, v.sub_name AS subName, v.cover, v.year, v.area, v.remarks,
              v.episode_count AS episodeCount, v.category_id AS categoryId,
              COALESCE(c.name, '') AS categoryName,
              v.content, v.actor, v.director, v.release_date AS releaseDate, v.lang, v.status
         FROM lcm_vod v LEFT JOIN lcm_category c ON c.id = v.category_id
        WHERE v.id = ? LIMIT 1`,
      [id],
    );
    const vod = rows[0];
    if (vod === undefined || vod.status !== 1) throw new NotFoundException('影片不存在');

    const lines = await this.linesOf(id);
    const related = await this.queryCards({
      where: 'v.status = 1 AND v.category_id = ? AND v.id <> ?',
      order: 'v.collected_at DESC, v.id DESC',
      take: 8,
      params: [vod.categoryId, id],
    });

    const { status: _status, ...rest } = vod;
    return { vod: rest, lines, related };
  }

  /** 播放页：取某线路的集列表。 */
  async play(
    vodId: string,
    lineIndex: string | undefined,
    ep: string | undefined,
  ): Promise<{
    vod: { id: string; name: string; cover: string; remarks: string; categoryId: string };
    lines: PlayLine[];
    line: PlayLine;
    episodes: EpisodeItem[];
    current: number;
  }> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        cover: string;
        remarks: string;
        categoryId: string;
        status: number;
      }>
    >('SELECT id, name, cover, remarks, category_id AS categoryId, status FROM lcm_vod WHERE id = ? LIMIT 1', [
      vodId,
    ]);
    const vod = rows[0];
    if (vod === undefined || vod.status !== 1) throw new NotFoundException('影片不存在');

    const lines = await this.linesOf(vodId);
    if (lines.length === 0) throw new NotFoundException('这部影片还没有可播放的线路');

    const wanted = toInt(lineIndex, 0, 0, lines.length - 1);
    const line = lines[wanted] ?? lines[0];
    if (line === undefined) throw new NotFoundException('线路不存在');

    const playRows = await this.dataSource.query<Array<{ playUrl: string }>>(
      'SELECT play_url AS playUrl FROM lcm_vod_play WHERE vod_id = ? AND source_from = ? AND COALESCE(source_id, 0) = ? LIMIT 1',
      [vodId, line.sourceFrom, line.sourceId === '' ? 0 : line.sourceId],
    );
    const parsed = playRows[0] === undefined ? [] : parsePlayUrl(playRows[0].playUrl);
    if (parsed.length === 0) throw new NotFoundException('这条线路没有可播放的集');

    // 集序号从 1 开始，前端直接用，不用再算下标
    const episodes: EpisodeItem[] = parsed.map((item, index) => ({
      index: index + 1,
      name: item.name,
      url: item.url,
    }));

    const current = toInt(ep, 1, 1, episodes.length);
    return {
      vod: {
        id: vod.id,
        name: vod.name,
        cover: vod.cover,
        remarks: vod.remarks,
        categoryId: vod.categoryId,
      },
      lines,
      line,
      episodes,
      current,
    };
  }

  /** 搜索：片名模糊 + 年份 + 排序。 */
  async search(input: {
    wd?: string;
    year?: string;
    sort?: string;
    take?: string;
    skip?: string;
  }): Promise<{ items: VodCard[]; total: number }> {
    const keyword = (input.wd ?? '').trim();
    if (keyword === '') return { items: [], total: 0 };

    const take = toInt(input.take, 24, 1, PAGE_LIMIT);
    const skip = toInt(input.skip, 0, 0, 1_000_000);
    const clauses = ['v.status = 1', "v.name LIKE CONCAT('%', ?, '%')"];
    // 输入的 % / _ 必须转义，否则一个 `%` 就变成 LIKE '%%%'，命中全表
    const params: unknown[] = [escapeLike(keyword)];
    const year = Number(input.year ?? '');
    if (Number.isFinite(year) && year > 0) {
      clauses.push('v.year = ?');
      params.push(year);
    }
    const where = clauses.join(' AND ');

    /**
     * 一次覆盖索引扫描取全部命中行的窄字段（id / 年份 / 两个时间），
     * 总数、年份选项、排序都在内存里算 —— 沿用 v1 的做法。
     *
     * `name LIKE '%kw%'` 没法用索引做范围，只能把 status=1 的索引项整段扫一遍（约 0.16 秒）；
     * 分两次查（本页 + COUNT）就是双倍时间，所以这里扫一次、剩下的在内存里做。
     * 常见词命中 1~2 万行也只有 1MB 左右，切页前排序完全扛得住。
     *
     * 必须 FORCE INDEX：不加的话优化器会为了省掉 filesort 选 idx_status_collected，
     * 按 collected_at 顺序扫 10 万行再回表校验 name LIKE，实测 5.5s。
     */
    const hits = await this.dataSource.query<
      Array<{ id: string; year: number; collectedAt: Date | string | null; createdAt: Date | string | null }>
    >(
      `SELECT v.id AS id, v.year AS year, v.collected_at AS collectedAt, v.created_at AS createdAt
         FROM lcm_vod v FORCE INDEX (idx_search)
        WHERE ${where}`,
      params,
    );

    const timeOf = (value: Date | string | null): number => (value === null ? 0 : new Date(value).getTime());
    const sorted = [...hits].sort((a, b) =>
      input.sort === 'new'
        ? timeOf(b.createdAt) - timeOf(a.createdAt) || compareId(String(b.id), String(a.id))
        : timeOf(b.collectedAt) - timeOf(a.collectedAt) || compareId(String(b.id), String(a.id)),
    );
    const pageRows = sorted.slice(skip, skip + take);
    const items = await this.queryCardsByIds(pageRows.map((row) => String(row.id)));
    return { items, total: hits.length };
  }

  /** 影片可用线路：线路设置里的启用项在前，未登记的照旧显示。 */
  private async linesOf(vodId: string): Promise<PlayLine[]> {
    const rows = await this.dataSource.query<
      Array<{
        sourceId: string | null;
        sourceFrom: string;
        playUrl: string;
        lineName: string | null;
        lineSort: number | null;
        lineEnabled: number | null;
        sourceName: string | null;
        id: string;
        parseUrl: string | null;
      }>
    >(
      `SELECT p.id AS id, p.source_id AS sourceId, p.source_from AS sourceFrom, p.play_url AS playUrl,
              s.parse_url AS parseUrl,
              l.name AS lineName, l.sort AS lineSort, l.is_enabled AS lineEnabled,
              s.name AS sourceName
         FROM lcm_vod_play p
         LEFT JOIN lcm_play_line l ON l.source_from = p.source_from
         LEFT JOIN lcm_collect_source s ON s.id = p.source_id
        WHERE p.vod_id = ?
        ORDER BY COALESCE(l.sort, 0) ASC, p.id ASC`,
      [vodId],
    );

    return rows
      .filter((row) => row.lineEnabled !== 0)
      .map((row) => ({
        id: String(row.id),
        sourceId: row.sourceId ?? '',
        sourceFrom: row.sourceFrom,
        name:
          (row.lineName ?? '') !== ''
            ? String(row.lineName)
            : (row.sourceName ?? '') !== ''
              ? String(row.sourceName)
              : row.sourceFrom,
        episodes: countEpisodes(row.playUrl),
        parseUrl: row.parseUrl ?? '',
      }))
      .filter((row) => row.episodes > 0);
  }

  /** 统一的卡片查询。 */
  private async queryCards(input: {
    where: string;
    order: string;
    take: number;
    skip?: number;
    params?: unknown[];
  }): Promise<VodCard[]> {
    const rows = await this.dataSource.query<CardRow[]>(
      `${CARD_SELECT}
        WHERE ${input.where}
        ORDER BY ${input.order}
        LIMIT ? OFFSET ?`,
      [...(input.params ?? []), input.take, input.skip ?? 0],
    );
    return rows.map((row) => toCard(row));
  }

  /** 按 id 取卡片，并保持传入顺序（搜索分两段查询时用）。 */
  private async queryCardsByIds(ids: string[]): Promise<VodCard[]> {
    if (ids.length === 0) return [];
    const rows = await this.dataSource.query<CardRow[]>(`${CARD_SELECT} WHERE v.id IN (?)`, [ids]);
    const byId = new Map(rows.map((row) => [String(row.id), toCard(row)]));
    return ids
      .map((id) => byId.get(String(id)))
      .filter((card): card is VodCard => card !== undefined);
  }
}
