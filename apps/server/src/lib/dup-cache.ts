/**
 * 重复影片分组的快照缓存。
 *
 * 分组结果必须扫全表（8.2 万影片 + 15 万线路）才能算出来，放在请求里算会让页面卡 1.6 秒。
 * 所以改成「写时标脏、读时给旧快照、后台重算」：
 * - 采集跑完、合并、忽略 → markDupDirty()
 * - 进页面拿快照；快照过期就先返回旧的，同时后台重算一遍
 * 服务是单进程（PM2 fork），进程内变量即可。
 */

let snapshot: unknown = null;
let snapshotAt = 0;
let dirty = true;
let computing = false;

/** 数据变了：下次读页面时后台重算 */
export const markDupDirty = (): void => {
  dirty = true;
};

export const getDupSnapshot = (): { data: unknown; at: number; dirty: boolean; computing: boolean } => ({
  data: snapshot,
  at: snapshotAt,
  dirty,
  computing,
});

export const setDupSnapshot = (data: unknown): void => {
  snapshot = data;
  snapshotAt = Date.now();
  dirty = false;
};

/** 同一时间只允许一个后台重算，避免多个页面同时触发 */
export const beginDupCompute = (): boolean => {
  if (computing) return false;
  computing = true;
  return true;
};

export const endDupCompute = (): void => {
  computing = false;
};
