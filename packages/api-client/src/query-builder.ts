/**
 * nest-crud 原生列表协议（架构决策 2.6）：请求参数 `take` / `skip` / `where` / `order`，
 * 响应 `data = { items, total }`。
 *
 * 刻意不引入 `page` / `pageSize`：那只是把同一个数字换个名字，前后端都要多写一次转换。
 */

export interface ListQuery {
  /** 每页条数，服务端上限 100（maxPerPage）。 */
  take?: number;
  skip?: number;
  /** 条件对象，序列化成 JSON 后放 `where`；操作符见 `$eq $ne $gt $gte $lt $lte $like $in $notIn $between`。 */
  where?: Record<string, unknown>;
  /** 排序对象，序列化成 JSON 后放 `order`，如 `{ id: 'DESC' }`。 */
  order?: Record<string, 'ASC' | 'DESC'>;
  /** 额外透传参数（如 `search`、`sourceId`）。 */
  extra?: Record<string, unknown>;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

/** 与服务端 `maxPerPage` 保持一致。 */
export const MAX_PER_PAGE = 100;

/** 模糊匹配没有 `$cont`，统一用 `$like: '%关键词%'`。 */
export function likeValue(keyword: string): string {
  return `%${keyword}%`;
}

/** 丢掉空值后序列化 `where`；没有有效条件时返回 undefined。 */
export function buildWhere(conditions: Record<string, unknown>): string | undefined {
  const entries = Object.entries(conditions).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (entries.length === 0) return undefined;
  return JSON.stringify(Object.fromEntries(entries));
}

/** 把 ListQuery 转成可直接交给 HttpClient 的查询参数。 */
export function buildListQuery(input: ListQuery = {}): Record<string, string> {
  const params: Record<string, string> = {};

  if (input.take !== undefined) params.take = String(Math.min(input.take, MAX_PER_PAGE));
  if (input.skip !== undefined) params.skip = String(Math.max(input.skip, 0));

  const where = input.where ? buildWhere(input.where) : undefined;
  if (where) params.where = where;

  if (input.order && Object.keys(input.order).length > 0) {
    params.order = JSON.stringify(input.order);
  }

  for (const [key, value] of Object.entries(input.extra ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }

  return params;
}

/** 兜底解析列表响应，字段缺失时退化成空数组而不是让页面白屏。 */
export function parseListResult<T>(data: unknown): ListResult<T> {
  const source = (data ?? {}) as { items?: unknown; total?: unknown };
  const items = Array.isArray(source.items) ? (source.items as T[]) : [];
  const total = typeof source.total === 'number' ? source.total : items.length;
  return { items, total };
}
