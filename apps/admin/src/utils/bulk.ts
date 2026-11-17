import { api } from '../api/client.ts';

/**
 * 批量删除：逐条发 DELETE，统计成功数。
 *
 * 为什么不用接口的 `/delete/bulk`：那个接口的 `ids` 从 query 取，
 * 而 `@ackplus/nest-crud` 只会把查询值当成「一个值列表」，
 * 传 `ids=1,2,3` 会变成 `IN ('1,2,3')` —— 删 0 行却仍返回成功（静默不生效）。
 * 逐条删的代价是 N 次请求，但批量删除本来就是低频操作，换来的是可见的失败明细。
 */
export async function bulkDelete(base: string, ids: string[]): Promise<{ ok: number; failed: string[] }> {
  const results = await Promise.allSettled(ids.map((id) => api.del(`${base}/${id}`)));
  const failed: string[] = [];
  results.forEach((result, index) => {
    const id = ids[index];
    if (result.status === 'rejected' && id !== undefined) failed.push(id);
  });
  return { ok: ids.length - failed.length, failed };
}
