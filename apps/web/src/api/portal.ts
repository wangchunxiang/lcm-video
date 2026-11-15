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
  url: string;
}

/** 首页 hero 的一项：`bgImage` 是运营在后台配的横幅图，空串表示没配（此时用 `cover` 放大裁切） */
export interface HeroCard extends VodCard {
  bgImage: string;
}

export interface HomeResult {
  categories: CategoryNode[];
  /** 首页 hero 轮播：运营在后台配的位，最多 8 个；空数组表示没配过，由首页回落到「今日更新」前 8 部 */
  hero: HeroCard[];
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
  vod: { id: string; name: string; cover: string; remarks: string };
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

export const portal = {
  home: () => http.get<HomeResult>('/home'),
  categories: () => http.get<CategoryNode[]>('/categories'),
  config: () => http.get<SiteConfig>('/config'),
  list: (alias: string, params: ListParams = {}) =>
    http.get<VodListPage>(`/list/${encodeURIComponent(alias)}`, params),
  detail: (id: string) => http.get<VodDetail>(`/detail/${id}`),
  play: (id: string, params: { line?: number; ep?: number } = {}) =>
    http.get<VodPlay>(`/play/${id}`, params),
  search: (params: SearchParams) => http.get<{ items: VodCard[]; total: number }>('/search', params),
};
