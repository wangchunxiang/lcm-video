/**
 * 进程内耗时统计：HTTP 请求、上游拉取、以及分项打点。
 *
 * 为什么不用 Prometheus / OpenTelemetry：单进程、单库的部署形态下，指标只需要回答
 * 「这一步现在 p95 多少」，每分钟打一行日志就够；上采集端要改部署，而部署正是
 * 这轮提速不打算动的部分。
 *
 * 口径：
 * - 每个 key 维护最近 512 个样本的环形缓冲，p95 取排序后的分位数；
 * - `count` 是自上次 flush 起的真实次数，可以大于缓冲长度；
 * - 样本少于 20 条时不报 p95（个位数样本的 p95 就是最大值，会误导）；
 * - flush 后清空，所以每行日志描述的是「刚刚这一分钟」。
 *
 * 只做记录不做聚合判断：要不要优化某一步，看 p95 的数字，不看这里。
 */

/** 每个 key 保留的样本数：够算 p95，又不至于让一次 flush 的排序变成开销 */
const WINDOW = 512;

/** 少于这个样本数不报 p95：几条样本的 p95 等于 max，看着像抖动 */
const MIN_SAMPLES_FOR_P95 = 20;

/** 一行日志最多列多少个 key，避免异常时刷屏 */
const MAX_LINES = 20;

interface Bucket {
  /** 环形缓冲，cursor 一直递增，写满后覆盖最旧的样本 */
  samples: number[];
  cursor: number;
  count: number;
  errors: number;
  bytes: number;
}

const buckets = new Map<string, Bucket>();

function bucketOf(key: string): Bucket {
  let bucket = buckets.get(key);
  if (bucket === undefined) {
    bucket = { samples: [], cursor: 0, count: 0, errors: 0, bytes: 0 };
    buckets.set(key, bucket);
  }
  return bucket;
}

/**
 * 记一次耗时。`ok === false` 计入错误数（上游失败的耗时和成功要分开看，
 * 失败往往是超时，混在一起会把 p95 拉高得不可解释）。
 */
export function recordLatency(
  key: string,
  ms: number,
  extra: { ok?: boolean; bytes?: number } = {},
): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const bucket = bucketOf(key);
  bucket.samples[bucket.cursor % WINDOW] = ms;
  bucket.cursor += 1;
  bucket.count += 1;
  if (extra.ok === false) bucket.errors += 1;
  if (extra.bytes !== undefined && Number.isFinite(extra.bytes) && extra.bytes > 0) {
    bucket.bytes += extra.bytes;
  }
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export interface LatencyLine {
  key: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
  /** 平均每次的字节数，只对上游打点有意义；没有字节数时为 0 */
  avgBytes: number;
}

/** 当前窗口的统计快照，按 p95 从高到低排序（测试与日志共用）。 */
export function latencySnapshot(): LatencyLine[] {
  const lines: LatencyLine[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.count === 0) continue;
    const sorted = [...bucket.samples].sort((a, b) => a - b);
    lines.push({
      key,
      count: bucket.count,
      errors: bucket.errors,
      p50: quantile(sorted, 0.5),
      p95: sorted.length >= MIN_SAMPLES_FOR_P95 ? quantile(sorted, 0.95) : 0,
      max: sorted[sorted.length - 1] ?? 0,
      avgBytes: bucket.bytes > 0 ? Math.round(bucket.bytes / bucket.count) : 0,
    });
  }
  return lines.sort((a, b) => (b.p95 || b.max) - (a.p95 || a.max));
}

/** 清空窗口，flush 之后调用；测试里也用得到。 */
export function resetLatency(): void {
  buckets.clear();
}

function formatLine(line: LatencyLine): string {
  const parts = [line.key, `n=${line.count}`];
  if (line.p95 > 0) parts.push(`p50=${line.p50.toFixed(1)}ms`, `p95=${line.p95.toFixed(1)}ms`);
  else parts.push(`p50=${line.p50.toFixed(1)}ms`);
  parts.push(`max=${line.max.toFixed(1)}ms`);
  if (line.errors > 0) parts.push(`err=${line.errors}`);
  if (line.avgBytes > 0) parts.push(`avg=${Math.round(line.avgBytes / 1024)}KB`);
  return parts.join(' ');
}

/**
 * 启动每分钟一次的检查，返回停止函数。
 *
 * **只报「值得看一眼」的 key**：出过错（err>0），或 p95（样本不足时退回 max）超过 `slowMs`。
 * 健康流量一行都不打——每分钟固定 20 行日志在单进程服务里就是纯噪声，而
 * 「今天有没有慢请求/失败请求」才是这类日志唯一要回答的问题。
 * 用 `unref()`：这个定时器不应该拖住进程退出（e2e 里 app.close() 之后进程要能直接结束）。
 */
export interface LatencyLogOptions {
  /** 阈值（ms）：p95 达到它才报；样本不足 20 条时用 max 比 */
  slowMs: number;
  intervalMs?: number;
}

export function startLatencyLog(
  log: (message: string) => void,
  options: LatencyLogOptions,
): () => void {
  const { slowMs, intervalMs = 60_000 } = options;
  const timer = setInterval(() => {
    const notable = latencySnapshot().filter(
      (line) => line.errors > 0 || (line.p95 > 0 ? line.p95 : line.max) >= slowMs,
    );
    for (const line of notable.slice(0, MAX_LINES)) log(`[latency] ${formatLine(line)}`);
    if (notable.length > MAX_LINES) log(`[latency] 其余 ${notable.length - MAX_LINES} 个 key 略`);
    resetLatency();
  }, intervalMs);
  // Node 与浏览器共用同一份声明，`unref` 只在 Node 下存在
  timer.unref?.();
  return () => clearInterval(timer);
}
