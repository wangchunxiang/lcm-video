import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { countEpisodes, parsePlayUrl } from '@lcm/shared';


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

/** 一级分类（带子分类）。 */
export interface CategoryNode {
  id: string;
  name: string;
  alias: string;
  children: Array<{ id: string; name: string; alias: string }>;
}

/** 播放线路。 */
export interface PlayLine {
  sourceId: string;
  sourceFrom: string;
  name: string;
  episodes: number;
}

/** 一行卡片（首页分区）。 */
export interface VodRow {
  title: string;
  more: string;
  items: VodCard[];
}

/** 播放页的集：在共享 Episode 的基础上带 1 基序号。 */
export interface EpisodeItem {
  index: number;
  name: string;
  url: string;
}

const PAGE_LIMIT = 100;
const HOME_ROW = 12;

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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** 首页：分类树 + 最新 + 今日更新 + 推荐。 */
  async home(): Promise<{ categories: CategoryNode[]; rows: VodRow[] }> {
    const categories = await this.categories();
    const latest = await this.queryCards({
      where: 'v.status = 1',
      order: 'v.created_at DESC, v.id DESC',
      take: HOME_ROW,
    });
    const today = await this.queryCards({
      where: 'v.status = 1 AND v.collected_at >= CURDATE()',
      order: 'v.collected_at DESC, v.id DESC',
      take: HOME_ROW,
    });
    const recommend = await this.queryCards({
      where: "v.status = 1 AND v.remarks <> ''",
      order: 'v.year DESC, v.collected_at DESC, v.id DESC',
      take: HOME_ROW,
    });

    const rows: VodRow[] = [
      { title: '今日更新', more: '/today', items: today },
      { title: '最新收录', more: '/category/all', items: latest },
      { title: '最近热播', more: '/category/all?sort=time', items: recommend },
    ].filter((row) => row.items.length > 0);

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
    category: { id: string; name: string; alias: string; pid: string } | null;
    types: Array<{ id: string; name: string; alias: string }>;
    years: number[];
    items: VodCard[];
    total: number;
  }> {
    const take = toInt(input.take, 24, 1, PAGE_LIMIT);
    const skip = toInt(input.skip, 0, 0, 1_000_000);

    const category =
      input.alias === 'all'
        ? null
        : (
            await this.dataSource.query<
              Array<{ id: string; name: string; alias: string; pid: string }>
            >('SELECT id, pid, name, alias FROM lcm_category WHERE alias = ? LIMIT 1', [input.alias])
          )[0] ?? null;
    if (input.alias !== 'all' && category === null) throw new NotFoundException('分类不存在');

    const types =
      category === null
        ? []
        : await this.dataSource.query<Array<{ id: string; name: string; alias: string }>>(
            'SELECT id, name, alias FROM lcm_category WHERE pid = ? ORDER BY sort ASC, id ASC',
            [category.pid === '0' ? category.id : category.pid],
          );

    const clauses: string[] = ['v.status = 1'];
    const params: unknown[] = [];
    if (category !== null) {
      if (category.pid === '0') {
        clauses.push('(v.category_id = ? OR v.category_pid = ?)');
        params.push(category.id, category.id);
      } else {
        clauses.push('v.category_id = ?');
        params.push(category.id);
      }
    }
    if (input.typeAlias !== undefined && input.typeAlias !== '') {
      const sub = types.find((row) => row.alias === input.typeAlias);
      if (sub === undefined) throw new BadRequestException('子分类不存在');
      clauses.push('v.category_id = ?');
      params.push(sub.id);
    }
    const year = Number(input.year ?? '');
    if (Number.isFinite(year) && year > 0) {
      clauses.push('v.year = ?');
      params.push(year);
    }

    const where = clauses.join(' AND ');
    // 排序沿用老站：`new` 按收录时间（created_at），其余按采集时间（collected_at）
    const order =
      input.sort === 'new' ? 'v.created_at DESC, v.id DESC' : 'v.collected_at DESC, v.id DESC';

    const items = await this.queryCards({ where, order, take, skip, params });
    const totalRows = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM lcm_vod v WHERE ${where}`,
      params,
    );
    const years = await this.dataSource.query<Array<{ year: number }>>(
      'SELECT DISTINCT year FROM lcm_vod WHERE status = 1 AND year > 0 ORDER BY year DESC LIMIT 15',
    );

    return {
      category,
      types,
      years: years.map((row) => Number(row.year)),
      items,
      total: Number(totalRows[0]?.total ?? 0),
    };
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
      take: 12,
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
    vod: { id: string; name: string; cover: string; remarks: string };
    lines: PlayLine[];
    line: PlayLine;
    episodes: EpisodeItem[];
    current: number;
  }> {
    const rows = await this.dataSource.query<
      Array<{ id: string; name: string; cover: string; remarks: string; status: number }>
    >('SELECT id, name, cover, remarks, status FROM lcm_vod WHERE id = ? LIMIT 1', [vodId]);
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
      vod: { id: vod.id, name: vod.name, cover: vod.cover, remarks: vod.remarks },
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
    const params: unknown[] = [keyword];
    const year = Number(input.year ?? '');
    if (Number.isFinite(year) && year > 0) {
      clauses.push('v.year = ?');
      params.push(year);
    }
    const where = clauses.join(' AND ');
    const order =
      input.sort === 'new' ? 'v.created_at DESC, v.id DESC' : 'v.collected_at DESC, v.id DESC';

    const items = await this.queryCards({ where, order, take, skip, params });
    const totalRows = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM lcm_vod v WHERE ${where}`,
      params,
    );
    return { items, total: Number(totalRows[0]?.total ?? 0) };
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
      }>
    >(
      `SELECT p.source_id AS sourceId, p.source_from AS sourceFrom, p.play_url AS playUrl,
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
        sourceId: row.sourceId ?? '',
        sourceFrom: row.sourceFrom,
        name:
          (row.lineName ?? '') !== ''
            ? String(row.lineName)
            : (row.sourceName ?? '') !== ''
              ? String(row.sourceName)
              : row.sourceFrom,
        episodes: countEpisodes(row.playUrl),
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
    const rows = await this.dataSource.query<
      Array<{
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
      }>
    >(
      `SELECT v.id, v.name, v.sub_name AS subName, v.cover, v.year, v.area, v.remarks,
              v.episode_count AS episodeCount, v.category_id AS categoryId,
              COALESCE(c.name, '') AS categoryName
         FROM lcm_vod v LEFT JOIN lcm_category c ON c.id = v.category_id
        WHERE ${input.where}
        ORDER BY ${input.order}
        LIMIT ? OFFSET ?`,
      [...(input.params ?? []), input.take, input.skip ?? 0],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      subName: row.subName,
      cover: row.cover,
      year: Number(row.year),
      area: row.area,
      remarks: row.remarks,
      episodeCount: Number(row.episodeCount),
      categoryId: row.categoryId,
      categoryName: row.categoryName,
    }));
  }
}
