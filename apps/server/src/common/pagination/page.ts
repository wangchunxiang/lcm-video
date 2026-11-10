/** 分页信封（决策 2.6）：列表、总数、当前页、每页条数、总页数。 */
export interface Page<T> {
  list: T[];
  total: number;
  pageNum: number;
  pageSize: number;
  totalPages: number;
}

export function toPage<T>(list: T[], total: number, pageNum: number, pageSize: number): Page<T> {
  return {
    list,
    total,
    pageNum,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
