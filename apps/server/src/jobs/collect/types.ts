/** 采集引擎内部结构：与源站接口、库表都不直接对应，只在这里流转。 */

export interface SourceVod {
  vodId: string;
  name: string;
  typeId: string;
  typeName: string;
  /** 源站二级分类的父 id，插入映射表时一起存 */
  typePid: string;
  subName: string;
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
  updatedAt: Date | null;
  playFrom: string;
  playUrl: string;
}

export interface VodPage {
  page: number;
  pageCount: number;
  total: number;
  list: SourceVod[];
}

export interface SourceClass {
  typeId: string;
  typeName: string;
  typePid: string;
}

export interface Counters {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

export const emptyCounters = (): Counters => ({
  total: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
  ignored: 0,
  failed: 0,
});

export interface FailItem {
  vodId: string;
  name: string;
  reason: string;
}

/**
 * 主键/外键在 TS 侧一律是 string（库列 BIGINT UNSIGNED，驱动按字符串返回）。
 * `''` 表示「引擎内部还没有值」，`'0'` 表示库里的 0（无关联）。
 */
export const ID_NONE = '';

/** id 是否有效（非空且不是库里的 0） */
export const hasId = (id: string): boolean => id !== ID_NONE && id !== '0';

/** 按数值比较两个 id：BIGINT 可能超过 Number 的安全整数，只能走 BigInt */
export const compareId = (left: string, right: string): number => {
  const a = BigInt(left);
  const b = BigInt(right);
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/** 本站分类，matchNames 已切成数组 */
export interface CategoryInfo {
  id: string;
  pid: string;
  name: string;
  matchNames: string[];
}

/** 源站分类 → 本站分类的映射结果 */
export interface MappingInfo {
  categoryId: string;
  status: number;
}

/** 采集源运行期配置（只取引擎需要的列） */
export interface SourceRuntime {
  id: string;
  name: string;
  apiUrl: string;
  apiParams: string;
  intervalSec: number;
  timeout: number;
  retryTimes: number;
  pagesize: number;
}
