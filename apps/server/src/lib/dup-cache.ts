/**
 * 重复影片分组的快照缓存。
 *
 * 分组结果要扫全表（8.2 万影片 + 15 万线路）才能算出来，放在请求里算会让页面卡 1.6 秒。
 * 所以页面只读快照：会话启动时算一次，之后只有数据变了（采集跑完、合并、忽略）才重算。
 * 没有定时刷新，也没有按 TTL 过期重算。
 */

let snapshot: unknown = null;
let snapshotAt = 0;
let dirty = true;
let computing = false;
let recompute: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 由工具路由注册重算函数，dup-cache 不依赖具体的查询实现 */
export const setDupRecompute = (fn: () => void): void => {
  recompute = fn;
};

/** 数据变了：去抖一秒合并连续变更，然后立刻在后台重算，不等到有人打开页面 */
export const markDupDirty = (): void => {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (dirty) recompute?.();
  }, 1000);
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

/** 同一时间只允许一个后台重算 */
export const beginDupCompute = (): boolean => {
  if (computing) return false;
  computing = true;
  return true;
};

export const endDupCompute = (): void => {
  computing = false;
};
