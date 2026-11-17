import { createHttpClient } from '@lcm/api-client';

/**
 * 前台只读接口客户端（`/api/web/*`，服务端 PortalController，全部公开）。
 * 下面的类型与 `apps/server/src/modules/portal/portal.service.ts` 的返回结构一一对应。
 *
 * TODO：这些契约类型应当挪到 `@lcm/shared`，由前后端同时引用；等页面成型时再收口。
 */
const http = createHttpClient({ baseUrl: '/api/web' });

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

export interface CategoryNode {
  id: string;
  name: string;
  alias: string;
  children: Array<{ id: string; name: string; alias: string }>;
}

export interface PlayLine {
  /** `lcm_vod_play.id`，播放页 URL 的第二段 */
  id: string;
  sourceId: string;
  sourceFrom: string;
  name: string;
  episodes: number;
  /** 采集源的解析接口；空串表示直链播放 */
  parseUrl: string;
}

export interface VodRow {
  title: string;
  /** 「更多」跳转地址；没有对应聚合页的区块没有这个字段 */
  more?: string;
  items: VodCard[];
}

export interface EpisodeItem {
  index: number;
  name: string;
  /** 源站原始地址（解析型源的 iframe 用） */
  url: string;
  /** 直链播放地址：指向本站播放列表代理，没有广告特征时等于 `url` */
  playUrl: string;
}

/** 首页：分类树 + 今日更新分区。 */
export interface HomeResult {
  categories: CategoryNode[];
  rows: VodRow[];
}

export interface VodListPage {
  category: { id: string; name: string; alias: string; pid: string };
  types: Array<{ id: string; name: string; alias: string }>;
  years: number[];
  items: VodCard[];
  total: number;
}

export interface VodDetail {
  vod: VodCard & {
    content: string;
    actor: string;
    director: string;
    releaseDate: string;
    lang: string;
  };
  lines: PlayLine[];
  related: VodCard[];
}

export interface VodPlay {
  vod: { id: string; name: string; cover: string; remarks: string; categoryId: string };
  lines: PlayLine[];
  line: PlayLine;
  episodes: EpisodeItem[];
  current: number;
}

export type ListParams = {
  type?: string;
  year?: string | number;
  sort?: 'time' | 'new';
  take?: number;
  skip?: number;
}

export type SearchParams = {
  wd: string;
  year?: string | number;
  sort?: 'time' | 'new';
  take?: number;
  skip?: number;
}

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

/** 请求被主动中断（切页、重新筛选）不是错误，catch 里直接忽略即可。 */
export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/** 每个接口都接受 `signal`：视图切换/重新筛选时旧请求要能立刻断掉。 */
export interface CallOptions {
  signal?: AbortSignal;
}

export const portal = {
  home: (options: CallOptions = {}) => http.get<HomeResult>('/home', undefined, options.signal),
  categories: (options: CallOptions = {}) =>
    http.get<CategoryNode[]>('/categories', undefined, options.signal),
  config: (options: CallOptions = {}) => http.get<SiteConfig>('/config', undefined, options.signal),
  list: (alias: string, params: ListParams = {}, options: CallOptions = {}) =>
    http.get<VodListPage>(`/list/${encodeURIComponent(alias)}`, params, options.signal),
  detail: (id: string, options: CallOptions = {}) =>
    http.get<VodDetail>(`/detail/${id}`, undefined, options.signal),
  play: (id: string, params: { line?: number; ep?: number } = {}, options: CallOptions = {}) =>
    http.get<VodPlay>(`/play/${id}`, params, options.signal),
  search: (params: SearchParams, options: CallOptions = {}) =>
    http.get<{ items: VodCard[]; total: number }>('/search', params, options.signal),
};
