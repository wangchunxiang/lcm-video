import { reactive, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export interface TableQueryOptions {
  /** 每页条数，默认 20 */
  pageSize?: number;
}

export interface TableQuery<T extends Record<string, QueryValue>> {
  /** 筛选条件；字段名与 URL query 同名 */
  filters: T;
  page: Ref<number>;
  pageSize: Ref<number>;
  /** 改条件后重查：回到第 1 页 */
  search: () => void;
  /** 条件与页码全部复位 */
  reset: () => void;
  onPageChange: (next: number) => void;
  /** 表格行号：跨页连续 */
  rowIndex: (index: number) => number;
}

/** 列表页筛选值允许的类型（与 URL query 一一对应） */
type QueryValue = string | number | boolean | null;

/** 把 URL 里的字符串还原成默认值的类型：默认是数字就当数字，其余保持字符串 */
function castLike(fallback: QueryValue, raw: string): QueryValue {
  if (typeof fallback === 'number') {
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }
  if (typeof fallback === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}

/** 写进 URL 时只保留非默认值，地址栏不至于挂一堆空参数 */
function isDefault(fallback: unknown, value: unknown): boolean {
  if (fallback === null || fallback === '') return value === null || value === '' || value === undefined;
  return value === fallback;
}

/**
 * 列表页的筛选条件 + 分页，绑定到 `route.query`。
 *
 * 解决两个问题：① 后台 6 个列表页各写一份 page/pageSize/search/reset/rowIndex（约 30 行同构代码）；
 * ② 刷新页面、分享链接、浏览器后退时筛选条件全丢（`docs/01-架构/架构总览.md` 5.2 要求可分享）。
 *
 * 只接管 state，不管请求：调用方 `watch([...])` 或 `search()` 后自己 load。
 */
export function useTableQuery<T extends Record<string, QueryValue>>(
  defaults: T,
  options: TableQueryOptions = {},
): TableQuery<T> {
  const route = useRoute();
  const router = useRouter();
  const initialSize = options.pageSize ?? 20;

  const filters = reactive({ ...defaults }) as T;
  const page = ref(1);
  const pageSize = ref(initialSize);

  /** URL → state（首次进入、前进后退） */
  function readUrl(query: Record<string, unknown>): void {
    const target = filters as Record<string, unknown>;
    for (const key of Object.keys(defaults)) {
      const raw = query[key];
      const fallback = defaults[key] as QueryValue;
      target[key] = typeof raw === 'string' && raw !== '' ? castLike(fallback, raw) : fallback;
    }
    const nextPage = Number(query.page);
    page.value = Number.isFinite(nextPage) && nextPage >= 1 ? Math.trunc(nextPage) : 1;
    const nextSize = Number(query.pageSize);
    pageSize.value = Number.isFinite(nextSize) && nextSize > 0 ? Math.trunc(nextSize) : initialSize;
  }

  /** state → URL（替换历史记录，不产生可回退的筛选步骤） */
  function writeUrl(): void {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (isDefault(defaults[key] as QueryValue, value)) continue;
      if (value === null || value === undefined || value === '') continue;
      query[key] = String(value);
    }
    if (page.value > 1) query.page = String(page.value);
    if (pageSize.value !== initialSize) query.pageSize = String(pageSize.value);

    const current = Object.keys(route.query)
      .filter((key) => route.query[key] !== undefined)
      .map((key) => `${key}=${String(route.query[key])}`)
      .sort()
      .join('&');
    const next = Object.keys(query)
      .map((key) => `${key}=${query[key]}`)
      .sort()
      .join('&');
    if (current === next) return;
    void router.replace({ query });
  }

  readUrl(route.query as Record<string, QueryValue>);

  // 只监听"外部"变化（浏览器后退、程序内 replace），避免写回时自激
  watch(
    () => route.query,
    (query) => readUrl(query as Record<string, QueryValue>),
  );

  function search(): void {
    page.value = 1;
    writeUrl();
  }

  function reset(): void {
    Object.assign(filters as Record<string, unknown>, defaults);
    page.value = 1;
    pageSize.value = initialSize;
    writeUrl();
  }

  function onPageChange(next: number): void {
    page.value = next;
    writeUrl();
  }

  function rowIndex(index: number): number {
    return (page.value - 1) * pageSize.value + index + 1;
  }

  return { filters, page, pageSize, search, reset, onPageChange, rowIndex };
}
