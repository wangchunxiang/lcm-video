import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { compareId, countEpisodes, escapeLike, parsePlayUrl, settingDefaultFlag } from '@lcm/shared';
import { SettingService } from '../setting/setting.service';
import { UpstreamPlaylistError, cleanPlaylist } from '../ad-feature/skip';
import type { CleanResult } from '../ad-feature/skip';
import { decodePlaylistToken, signPlaylistPath, verifyPlaylistPath } from './playlist-proxy';


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

/**
 * 线路行：`playUrl` 是源站的原始剧集串（里面全是直链地址），只在服务端内部流转，
 * 不能出现在任何响应里——对外一律走 `toPublicLine` 的白名单投影。
 */
type PlayLineRow = PlayLine & { playUrl: string };

/** 把内部线路行收窄成对外形状：只保留 `PlayLine` 声明的 6 个字段。 */
function toPublicLine(line: PlayLineRow): PlayLine {
  return {
    id: line.id,
    sourceId: line.sourceId,
    sourceFrom: line.sourceFrom,
    name: line.name,
    episodes: line.episodes,
    parseUrl: line.parseUrl,
  };
}

/** 一行卡片（首页分区）。 */
export interface VodRow {
  title: string;
  /** 「更多」跳转地址；没有对应聚合页的区块不填 */
  more?: string;
  items: VodCard[];
  /** 区块总条数；items 受展示上限截断时（首页今日更新只带 16 条）用它显示真实数量 */
  total?: number;
}

/** 播放页的集：在共享 Episode 的基础上带 1 基序号。 */
export interface EpisodeItem {
  index: number;
  name: string;
  /** 源站原始地址：解析型源（`parse_url` 非空）用这个地址拼 iframe */
  url: string;
  /**
   * 直链播放地址，指向本站的播放列表代理 `/api/web/playlist`。
   * 该源没有广告特征时后端不会包一层，这个值等于 `url`。
   */
  playUrl: string;
}

/** 前台公开配置：站点信息 + 播放器开关 + 首屏封面域名。 */
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
  /** 首屏建议 preconnect 的封面域名（不含协议）；空数组表示不要预热 */
  coverHosts: string[];
}

const PAGE_LIMIT = 100;
/** 首页每块给 8 列 × 2 行 = 16 部（前台首页按 16 部一屏两行排） */
const HOME_ROW = 16;

/**
 * 播放列表代理最多等上游多久。源站慢的时候（西瓜资源的首页响应 0.4~19 秒都见过）
 * 宁可让播放器明确拿到一个 502、用户换线路，也不把它甩回源站自己跳（iOS 在那条路上
 * 最容易偶发失败）。等不到就后台预热把缓存填上，下次播放直接命中。
 * 10 秒是等与不等之间的折中：覆盖常见的源站抖动，又不会让首屏白等太久；
 * 真撞上 19 秒那种，预热会在后台把缓存填上。
 */
const PLAYLIST_BUDGET_MS = 10_000;
/** 后台预热的预算：只求最终能拿到，慢一点没关系 */
const PLAYLIST_WARM_BUDGET_MS = 45_000;

/** 是不是 m3u8 播放列表；只有它才谈得上按分片删广告 */
function isHlsPlaylist(url: string): boolean {
  return /^https?:\/\//i.test(url) && /\.m3u8(\?|$)/i.test(url);
}

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
  private readonly logger = new Logger(PortalService.name);

  /** 年份选项缓存：全站同一份，列表页每次请求都会要，60 秒内不重复查库。 */
  private yearsCache: { at: number; years: number[] } | null = null;

  /** 计数缓存：key = `分类id:年份`（一级分类）或 `w|where|参数`（普通条件），翻页/切排序时不必重复计数。 */
  private readonly countCache = new Map<string, { at: number; total: number }>();

  private static readonly YEARS_TTL_MS = 60_000;

  private static readonly COUNT_TTL_MS = 60_000;

  /** 计数缓存的条目上限：超出就整体清空，避免年份×分类的组合无限增长 */
  private static readonly COUNT_CACHE_MAX = 1_000;

  /** 封面域名预热列表：全站一份，1 小时内不重算（域名分布变化很慢）。 */
  private coverHintCache: { at: number; hosts: string[] } | null = null;

  private static readonly COVER_HINT_TTL_MS = 3_600_000;

  /**
   * 首屏预热几个封面域名。浏览器全局 speculative connection 预算约 6 条，
   * 必须给本站自己的接口留一半；超出的 preconnect 会互相挤掉，白耗握手。
   */
  private static readonly COVER_HINT_LIMIT = 3;

  /** 累计覆盖到 70% 就停：再往后加域名，首屏命中率的提升抵不过多一条连接 */
  private static readonly COVER_HINT_COVERAGE = 0.7;

  /** 第一名占比低于 10% 说明封面域名已经长尾化，预热没有意义，直接不下发 */
  private static readonly COVER_HINT_MIN_SHARE = 0.1;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly setting: SettingService,
    /** 名字不能叫 config：本类已有一个 `config()` 方法 */
    private readonly configService: ConfigService,
  ) {}

  /**
   * 首屏要预热的封面域名。
   *
   * 为什么不落盘也不代理：封面图总量是几十 GB 级，存一遍的代价远大于省下的握手；
   * 这里只下发域名，由浏览器提前做 DNS/TCP/TLS，图片本身仍然直连源站。
   *
   * 口径（详见 `docs/` 的性能一节）：
   * - 按引用行数排序（这里唯一的曝光代理指标；没有真实曝光埋点）；
   * - 累计覆盖率到 70% 或满 3 条即停；
   * - 第一名占比 < 10% 时返回空数组——域名一长尾化，preconnect 就是负收益；
   * - 有 http 封面的域名整条跳过：混合内容会被浏览器拦掉，预热也白预；
   * - 排除 `lcm_cover_check` 判死（status = 2）的域名。
   *
   * 这个查询失败不能影响 `/config`：返回空数组，前端自然不加标签。
   */
  async coverHosts(): Promise<string[]> {
    const now = Date.now();
    const cached = this.coverHintCache;
    if (cached !== null && now - cached.at < PortalService.COVER_HINT_TTL_MS) {
      return cached.hosts;
    }

    let hosts: string[] = [];
    try {
      /*
       * WITH ROLLUP 多回来的那一行（host 为 null）就是总数，省掉一次 COUNT(*)——
       * 全表 63k 行时这一趟是十几毫秒，而 /config 是每次打开页面都要走的。
       */
      const rows = await this.dataSource.query<
        Array<{ host: string | null; total: number | string; secure: number | string }>
      >(
        `SELECT v.cover_host AS host, COUNT(*) AS total, SUM(v.cover LIKE 'https://%') AS secure
           FROM lcm_vod v
          WHERE v.status = 1 AND v.cover <> '' AND v.cover_host <> ''
            AND v.cover_host NOT IN (SELECT c.host FROM lcm_cover_check c WHERE c.status = 2)
          GROUP BY v.cover_host WITH ROLLUP`,
      );
      const all = Number(rows.find((row) => row.host === null)?.total ?? 0);
      const ranked = rows
        .filter((row): row is { host: string; total: number | string; secure: number | string } => row.host !== null)
        .map((row) => ({ host: row.host, total: Number(row.total), secure: Number(row.secure) }))
        .sort((left, right) => right.total - left.total);

      const top = ranked[0];
      if (all > 0 && top !== undefined && top.total / all >= PortalService.COVER_HINT_MIN_SHARE) {
        let covered = 0;
        for (const row of ranked) {
          if (hosts.length >= PortalService.COVER_HINT_LIMIT) break;
          /* 有 http 封面说明这个域名无法整条预热，跳过（不中断：后面的域名可能全是 https） */
          if (row.secure < row.total) continue;
          hosts.push(row.host);
          covered += row.total;
          if (covered / all >= PortalService.COVER_HINT_COVERAGE) break;
        }
      }
    } catch (error) {
      this.logger.warn(`封面域名统计失败：${(error as Error).message}`);
      hosts = [];
    }

    this.coverHintCache = { at: now, hosts };
    return hosts;
  }

  /** 前台公开配置：站点信息 + 播放器开关 + 首屏封面域名。后台配置项不在这里暴露。 */
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
      coverHosts,
    ] = await Promise.all([
      this.setting.get('site_name', '蓝草莓影视'),
      this.setting.get('site_subtitle', '高清影视在线观看'),
      this.setting.get('site_disclaimer', ''),
      this.setting.get('site_stats_code', ''),
      this.setting.number('list_page_size', 24),
      this.setting.flag('player_autoplay', settingDefaultFlag('player_autoplay')),
      this.setting.flag('player_autonext', settingDefaultFlag('player_autonext')),
      this.setting.flag('player_resume', settingDefaultFlag('player_resume')),
      this.setting.flag('player_screenshot', settingDefaultFlag('player_screenshot')),
      this.setting.flag('player_fullscreen', settingDefaultFlag('player_fullscreen')),
      this.setting.flag('player_webfullscreen', settingDefaultFlag('player_webfullscreen')),
      this.setting.flag('player_setting', settingDefaultFlag('player_setting')),
      this.coverHosts(),
    ]);

    return {
      siteName,
      siteSubtitle,
      siteDisclaimer,
      siteStatsCode,
      listPageSize: Math.min(60, Math.max(12, listPageSize)),
      player: { autoplay, autonext, resume, screenshot, fullscreen, webfullscreen, setting },
      coverHosts,
    };
  }

  /** 首页：分类树 + 今日更新。 */
  async home(): Promise<{ categories: CategoryNode[]; rows: VodRow[] }> {
    const where = 'v.status = 1 AND v.collected_at >= CURDATE()';
    const [categories, today, todayTotal] = await Promise.all([
      this.categories(),
      this.queryCards({
        where,
        order: 'v.collected_at DESC, v.id DESC',
        take: HOME_ROW,
      }),
      // 卡片头上的「N 部」要的是当天总数，不是被 HOME_ROW 截断后的 16
      // 今天的数字不缓存：采集完却看不到新值，用户会当成 bug
      this.countByWhere(where, [], 0),
    ]);

    const rows: VodRow[] = [{ title: '今日更新', total: todayTotal, items: today }].filter(
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

    /*
     * 分类与它的「同级分类」一次查回来。列表页顶部要渲染两样东西（当前分类 + 同级 tab），
     * 以前是两条串行 SQL，等于白白多一个往返（每条 5~14ms，翻页/切筛选都要付一次）。
     *
     * `s.pid = IF(c.pid = '0', c.id, c.pid)`：一级分类取它自己的子分类，二级分类取它的兄弟。
     * alias 由 `category.service.ts` 的 `assertAliasFree` 保证全局唯一，所以不会有笛卡尔式的歧义；
     * 没有同级时 LEFT JOIN 还是返回一行（s.* 为 null），「分类不存在」则零行。
     */
    const head = await this.dataSource.query<
      Array<{
        id: string;
        pid: string;
        name: string;
        alias: string;
        sid: string | null;
        sname: string | null;
        salias: string | null;
      }>
    >(
      `SELECT c.id, c.pid, c.name, c.alias, s.id AS sid, s.name AS sname, s.alias AS salias
         FROM lcm_category c
         LEFT JOIN lcm_category s ON s.pid = IF(c.pid = '0', c.id, c.pid)
        WHERE c.alias = ?
        ORDER BY s.sort ASC, s.id ASC`,
      [input.alias],
    );
    const current = head[0];
    // 只认真实分类：没有「全部」聚合页，未知别名一律 404
    if (current === undefined) throw new NotFoundException('分类不存在');
    const category = { id: current.id, pid: current.pid, name: current.name, alias: current.alias };
    const types = head.flatMap((row) =>
      row.sid === null || row.salias === null
        ? []
        : [{ id: row.sid, name: row.sname ?? '', alias: row.salias }],
    );

    const clauses: string[] = ['v.status = 1'];
    const params: unknown[] = [];
    const typeAlias = input.typeAlias ?? '';
    const sub = typeAlias === '' ? null : (types.find((row) => row.alias === typeAlias) ?? null);
    if (typeAlias !== '' && sub === null) throw new BadRequestException('子分类不存在');
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

  /**
   * 普通计数：条件都带索引前缀，直接 COUNT 即可。
   *
   * 结果缓存 60 秒（`ttlMs = 0` 可关）：列表页翻页、切排序、点子分类都会把同一个条件
   * 再问一遍，而采集入库晚一分钟被看到无所谓。首页的「今日更新 N 部」**不缓存**
   * （传 0）——刚采集完却看不到新数字，用户会当成 bug。
   */
  private async countByWhere(
    where: string,
    params: unknown[],
    ttlMs: number = PortalService.COUNT_TTL_MS,
  ): Promise<number> {
    const key = ttlMs > 0 ? `w|${where}|${JSON.stringify(params)}` : '';
    const now = Date.now();
    if (key !== '') {
      const hit = this.countCache.get(key);
      if (hit !== undefined && now - hit.at < ttlMs) return hit.total;
    }
    const rows = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM lcm_vod v WHERE ${where}`,
      params,
    );
    const total = Number(rows[0]?.total ?? 0);
    if (key !== '') {
      // 年份 × 分类的组合有上限，但也不该无限长；超了就整体丢掉，重建比淘汰更简单
      if (this.countCache.size >= PortalService.COUNT_CACHE_MAX) this.countCache.clear();
      this.countCache.set(key, { at: now, total });
    }
    return total;
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

    /*
     * 线路与推荐彼此不依赖，并行发出去：串行时详情页要多等一个往返（推荐那条还是
     * 带排序的卡片查询，最贵）。两者失败语义一致，`Promise.all` 不需要额外处理。
     */
    const [lines, related] = await Promise.all([
      this.linesOf(id),
      this.queryCards({
        where: 'v.status = 1 AND v.category_id = ? AND v.id <> ?',
        order: 'v.collected_at DESC, v.id DESC',
        take: 8,
        params: [vod.categoryId, id],
      }),
    ]);

    const { status: _status, ...rest } = vod;
    return { vod: rest, lines: lines.map(toPublicLine), related };
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
    // 上面已经保证至少一条，`wanted` 又被夹到 [0, length-1]，这里只需要让 TS 收窄类型
    const line = lines[wanted];
    if (line === undefined) throw new NotFoundException('线路不存在');

    const parsed = parsePlayUrl(line.playUrl);
    if (parsed.length === 0) throw new NotFoundException('这条线路没有可播放的集');

    /*
     * 直链播放走本站的播放列表代理，代理里按该源已确认的广告特征删分片。
     * 只在「该源有广告特征 + 不是解析型源」时才包这一层：否则省掉一次往返，
     * 播放链路和以前完全一致。解析型源走 iframe，拿的是源站原始地址。
     */
    const proxied = !line.parseUrl && (await this.hasAdFeature(line.sourceId));
    const secret = this.configService.get<string>('app.jwtSecret') ?? '';

    // 集序号从 1 开始，前端直接用，不用再算下标
    const episodes: EpisodeItem[] = parsed.map((item, index) => ({
      index: index + 1,
      name: item.name,
      url: item.url,
      // 只有 m3u8 才谈得上删分片：mp4 之类直接给原地址，别让代理去拉整个文件
      playUrl: proxied && secret && isHlsPlaylist(item.url)
        ? signPlaylistPath(secret, line.sourceId, item.url)
        : item.url,
    }));

    const current = toInt(ep, 1, 1, episodes.length);

    /*
     * 播放页一打开就在后台预热当前集：播放器要再过一会儿才请求 m3u8，
     * 预热先发出去，等它真的要的时候多半已经命中（或至少在途共用同一次拉取）。
     * 预热当前集，再顺带预热下一集：连看是常态，用户点「下一集」时上游多半已经命中。
     * 只多一条后台请求，且播放列表本身只有几 KB，代价远小于再等一次源站。
     */
    const warmTarget = episodes[current - 1];
    if (proxied && warmTarget !== undefined) this.warmPlaylist(line.sourceId, warmTarget.url);
    const nextTarget = episodes[current];
    if (proxied && nextTarget !== undefined) this.warmPlaylist(line.sourceId, nextTarget.url);

    return {
      vod: {
        id: vod.id,
        name: vod.name,
        cover: vod.cover,
        remarks: vod.remarks,
        categoryId: vod.categoryId,
      },
      lines: lines.map(toPublicLine),
      line: toPublicLine(line),
      episodes,
      current,
    };
  }

  /** 该源有没有已确认的广告特征（有才值得把播放列表过一遍代理）。 */
  private async hasAdFeature(sourceId: string): Promise<boolean> {
    if (!/^\d+$/.test(sourceId)) return false;
    const rows = await this.dataSource.query<Array<{ hit: number }>>(
      'SELECT 1 AS hit FROM lcm_ad_feature WHERE source_id = ? LIMIT 1',
      [sourceId],
    );
    return rows.length > 0;
  }

  /**
   * 播放列表代理：解出被代理的地址并校验签名，只有 `/api/web/play` 签出的地址才放行，
   * 否则就成了对外的开放代理（SSRF）。返回的正文一律由调用方直出：命中广告特征是删减版，
   * 没命中是绝对化后的原文；只有拉取失败才回 `clean: null`，由控制器报 502。
   */
  async proxiedPlaylist(
    sourceId: string,
    token: string,
    sig: string,
  ): Promise<{ url: string; clean: CleanResult | null }> {
    const secret = this.configService.get<string>('app.jwtSecret') ?? '';
    const url = decodePlaylistToken(token);
    if (!/^\d+$/.test(sourceId) || !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('播放地址无效');
    }
    if (!secret || !verifyPlaylistPath(secret, sourceId, url, sig)) {
      throw new ForbiddenException('播放地址无效');
    }
    if (!isHlsPlaylist(url)) throw new BadRequestException('播放地址无效');
    /* 返回校验通过的地址本身，控制器只直出这个地址的正文，不再自己解 token */
    try {
      return { url, clean: await cleanPlaylist(this.dataSource, sourceId, url, PLAYLIST_BUDGET_MS) };
    } catch (error) {
      /*
       * 只把「上游自己的失败」当 502：DB 挂了、我们写错了这类错误必须原样抛出去（→ 500），
       * 否则线上表现为「所有源站都在抽风」，真实原因只剩一行 warn。
       */
      if (!(error instanceof UpstreamPlaylistError)) throw error;
      // 去广告是增益功能：拉不到上游 m3u8 就回 null 报 502，用户换线路重试；
      // 不把播放器甩回源站——源站的跳转链正是 iOS 偶发失败的地方
      this.logger.warn(
        `播放列表拉取失败，返回 502（source ${sourceId}）：${error.message}`,
      );
      // 顺手用大预算在后台再拉一次：源站慢的时候这一部影片下次播放就能直接命中缓存
      this.warmPlaylist(sourceId, url);
      return { url, clean: null };
    }
  }

  /**
   * 后台预热：不阻塞响应、失败就算了。
   * `skip.ts` 内部有在途去重与 60 秒缓存，重复调用不会打爆源站。
   */
  private warmPlaylist(sourceId: string, url: string): void {
    void cleanPlaylist(this.dataSource, sourceId, url, PLAYLIST_WARM_BUDGET_MS).catch(() => undefined);
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
  private async linesOf(vodId: string): Promise<PlayLineRow[]> {
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
        playUrl: row.playUrl,
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
