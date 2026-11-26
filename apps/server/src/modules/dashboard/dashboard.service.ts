import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { CollectRange } from './dto/collect-series.dto';

/** 一天的采集量。前四项就是一次采集的四种去向（新增/更新/跳过/忽略），failed 是异常。 */
export interface DashboardDay {
  /** 服务端时区的 `YYYY-MM-DD` */
  date: string;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

interface DashboardHour {
  /** 0–23 */
  hour: number;
  runs: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

/** 采集量曲线的粒度：本日按小时，本周/本月按天 */
export type CollectUnit = 'hour' | 'day';

/** 采集量曲线的一格。字段名与 KPI 卡一致，前端画图直接按 key 取。 */
export interface CollectBucket {
  /** 横轴标签：按小时是 `08:00`，按天是 `11-24` */
  key: string;
  runs: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  /** 末尾那个格子是「还在进行中」的小时/天，前端可以画得淡一点 */
  partial: boolean;
}

/** 采集量曲线。长度固定：本日 24 格，本周/本月到今天为止，缺的补 0。 */
export interface CollectSeries {
  range: CollectRange;
  unit: CollectUnit;
  buckets: CollectBucket[];
  /** 整个区间的合计，卡片头显示「N 次运行 · 新增 X」 */
  totals: DashboardSummary['todayLog'];
}

/** 首页概览：一次返回所有区块需要的数据。 */
export interface DashboardSummary {
  vod: { total: number; enabled: number; disabled: number; today: number };
  play: { total: number };
  category: { total: number };
  source: { total: number; enabled: number };
  task: { total: number; enabled: number };
  todayLog: {
    runs: number;
    inserted: number;
    updated: number;
    skipped: number;
    ignored: number;
    failed: number;
  };
  /** 近 7 天趋势（8 个点：今天往前推 7 天 + 今天），补零，长度固定 8，最后一项是今天 */
  trend: DashboardDay[];
  /** 一级分类影片数，按数量降序；前端只取前几个画饼图，长尾并「其他」 */
  categories: Array<{ name: string; count: number }>;
  /** 线路分布：播放地址数降序，最多 4 条 + 总线路数 */
  lines: { total: number; items: Array<{ name: string; count: number }> };
  pending: { coverCheck: number; mergeGroups: number; orphanVods: number; failedLogs: number };
  /** 今日入库：按自增 id 倒序（= 写入顺序），最多 50 条，卡片内滚动 */
  latestVods: LatestFeed;
  /** 今日更新：`updated_at` 倒序，最多 50 条；靠 `idx_updated_at` 才不慢（无索引要 1.3 秒） */
  latestUpdates: LatestFeed;
}

/** 今日入库 / 今日更新：`total` 是当日总条数（卡片头上显示），`items` 只带回前 50 条 */
export interface LatestFeed {
  total: number;
  items: LatestVod[];
}

/** 今日入库 / 今日更新共用的列表项 */
export interface LatestVod {
  id: string;
  name: string;
  year: number;
  /** 入库时间（collected_at，全量导入的历史数据可能为 null） */
  collectedAt: Date | null;
  /** 最后修改时间（update 时才会变，等于 created_at 说明入库后没再动过） */
  updatedAt: Date | null;
}

/** 「今日入库 / 今日更新」两张卡最多带回几条（多的在卡片里滚） */
const LATEST_COUNT = 50;

/** 趋势窗口长度（天）：从今天往前推 7 天，含今天算 8 个点 */
const TREND_DAYS = 7;
/** 趋势与 sparkline 的点数：7 天窗口 + 今天 */
const TREND_POINTS = TREND_DAYS + 1;
/**
 * 采集范围 `全部`（手动采集一个源站就是它：一次性把整站拉下来）。
 * 日统计与源站 sparkline 都只看增量，全量那一跑会把当天柱子顶成平地起尖，
 * 曲线失去意义，所以按日志快照里的 range_type 排除。
 */
const FULL_RANGE = 4;

/**
 * 今日/按小时的五个量：`COUNT(*)` 算全部运行（全量采集也是一次运行），
 * 数据量只算增量采集——全量一次能写几万行，混进来会把 KPI 和曲线一起顶成尖峰。
 * 两处查询共用，参数是 5 个 `FULL_RANGE`。
 */
const LOG_SUMS = `COUNT(*) AS runs,
              COALESCE(SUM(CASE WHEN range_type <> ? THEN inserted END), 0) AS inserted,
              COALESCE(SUM(CASE WHEN range_type <> ? THEN updated END), 0) AS updated,
              COALESCE(SUM(CASE WHEN range_type <> ? THEN skipped END), 0) AS skipped,
              COALESCE(SUM(CASE WHEN range_type <> ? THEN ignored END), 0) AS ignored,
              COALESCE(SUM(CASE WHEN range_type <> ? THEN failed END), 0) AS failed`;

/** `LOG_SUMS` 的占位符参数 */
const LOG_PARAMS = [FULL_RANGE, FULL_RANGE, FULL_RANGE, FULL_RANGE, FULL_RANGE];

type LogNumbers = Record<'runs' | 'inserted' | 'updated' | 'skipped' | 'ignored' | 'failed', string | number>;
/**
 * 一行聚合结果：mysql2 的 `SUM()` 回来是字符串，统一在这里收口成数字。
 * 入参只声明用得到的那几个字段（不写索引签名），这样已经算成 `number` 的 `DashboardHour`
 * 也能直接传进来，不必先摊平成 Record。
 */
function logNumbers(row: Partial<LogNumbers> | undefined): DashboardSummary['todayLog'] {
  return {
    runs: Number(row?.runs ?? 0),
    inserted: Number(row?.inserted ?? 0),
    updated: Number(row?.updated ?? 0),
    skipped: Number(row?.skipped ?? 0),
    ignored: Number(row?.ignored ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

/** 曲线合计：卡片头的「N 次运行 · 新增 X」用它，前端不必再 reduce 一遍 */
function sumBuckets(buckets: CollectBucket[]): DashboardSummary['todayLog'] {
  const total: DashboardSummary['todayLog'] = {
    runs: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    ignored: 0,
    failed: 0,
  };
  for (const bucket of buckets) {
    total.runs += bucket.runs;
    total.inserted += bucket.inserted;
    total.updated += bucket.updated;
    total.skipped += bucket.skipped;
    total.ignored += bucket.ignored;
    total.failed += bucket.failed;
  }
  return total;
}

/** 补零用的空值，字段与 DashboardDay 保持一致 */
const EMPTY_DAY = { inserted: 0, updated: 0, skipped: 0, ignored: 0, failed: 0 };

/** 服务端本地日期（进程时区固定 Asia/Shanghai，与库里 DATETIME 的字面值一致） */
function dayKey(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 从 `count - 1` 天前到今天，按时间正序 */
function recentDayKeys(count: number): string[] {
  const today = new Date();
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    keys.push(dayKey(date));
  }
  return keys;
}

/**
 * 本周一 00:00。周一算一周第一天（`getDay()` 里周日是 0，要往前推 6 天）。
 * 不能用「今天减 7 天」——那是滚动窗口，与自然周不是一回事。
 */
function startOfWeek(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
}

/** 区间的第一天：本周一是它，本月则是 1 号 */
function rangeStart(range: Exclude<CollectRange, 'day'>, now: Date): Date {
  return range === 'week' ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1);
}

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async summary(): Promise<DashboardSummary> {
    const days = recentDayKeys(TREND_POINTS);
    const [header, series, categories, lines, pending, latestVods, latestUpdates] =
      await Promise.all([
        this.header(),
        this.daySeries(days[0] ?? dayKey(new Date())),
        this.categories(),
        this.lines(),
        this.pending(),
        this.latestVods(),
        this.latestUpdates(),
      ]);

    // 缺数据的天补 0：前端按索引取点画图，少一格就会错位
    const byDate = new Map(series.map((item) => [item.date, item]));
    const trend = days.map(
      (date) => byDate.get(date) ?? { date, ...EMPTY_DAY },
    );

    return {
      ...header,
      trend,
      categories,
      lines,
      pending,
      latestVods,
      latestUpdates,
    };
  }

  /**
   * 顶部 KPI 条 + 今日合计。
   * 小时分布不在这里算：首页的曲线现在分了本日/本周/本月，由 `collectSeries()`
   * 自己按范围取数，免得每次刷首页都白算 24 个桶。
   */
  private async header(): Promise<
    Pick<DashboardSummary, 'vod' | 'play' | 'category' | 'source' | 'task' | 'todayLog'>
  > {
    const [counts, todayLog] = await Promise.all([this.counts(), this.todayTotals()]);
    return { ...counts, todayLog };
  }

  /** 四张卡要的规模数字（都是走索引的 COUNT） */
  private async counts(): Promise<
    Pick<DashboardSummary, 'vod' | 'play' | 'category' | 'source' | 'task'>
  > {
    // 5 条互相独立的 COUNT：一次全发出去，别一条等一条（库在 NAS 上，每条都是跨网络的往返）
    const [vodRows, playRows, categoryRows, sourceRows, taskRows] = await Promise.all([
      this.dataSource.query<Array<Record<string, string>>>(
        `SELECT COUNT(*) AS total,
                SUM(status = 1) AS enabled,
                SUM(status = 0) AS disabled,
                SUM(created_at >= CURDATE()) AS today
           FROM lcm_vod`,
      ),
      this.dataSource.query<Array<{ total: string }>>('SELECT COUNT(*) AS total FROM lcm_vod_play'),
      this.dataSource.query<Array<{ total: string }>>('SELECT COUNT(*) AS total FROM lcm_category'),
      this.dataSource.query<Array<Record<string, string>>>(
        'SELECT COUNT(*) AS total, SUM(is_enabled = 1) AS enabled FROM lcm_collect_source',
      ),
      this.dataSource.query<Array<Record<string, string>>>(
        'SELECT COUNT(*) AS total, SUM(is_enabled = 1) AS enabled FROM lcm_collect_task',
      ),
    ]);
    const [vodCounts] = vodRows;
    const [playCount] = playRows;
    const [categoryCount] = categoryRows;
    const [sourceCount] = sourceRows;
    const [taskCount] = taskRows;
    return {
      vod: {
        total: Number(vodCounts?.total ?? 0),
        enabled: Number(vodCounts?.enabled ?? 0),
        disabled: Number(vodCounts?.disabled ?? 0),
        today: Number(vodCounts?.today ?? 0),
      },
      play: { total: Number(playCount?.total ?? 0) },
      category: { total: Number(categoryCount?.total ?? 0) },
      source: {
        total: Number(sourceCount?.total ?? 0),
        enabled: Number(sourceCount?.enabled ?? 0),
      },
      task: {
        total: Number(taskCount?.total ?? 0),
        enabled: Number(taskCount?.enabled ?? 0),
      },
    };
  }

  /** 今日合计（口径见 LOG_SUMS） */
  private async todayTotals(): Promise<DashboardSummary['todayLog']> {
    const [row] = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT ${LOG_SUMS}
         FROM lcm_collect_task_log
        WHERE started_at >= CURDATE()`,
      LOG_PARAMS,
    );
    return logNumbers(row);
  }

  /** 今日按小时的运行分布，没有记录的时段补 0（前端按时段画满 24 根） */
  private async hourBuckets(): Promise<DashboardHour[]> {
    const rows = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT HOUR(started_at) AS h, ${LOG_SUMS}
         FROM lcm_collect_task_log
        WHERE started_at >= CURDATE()
        GROUP BY h`,
      LOG_PARAMS,
    );
    const byHour = new Map(rows.map((row) => [Number(row.h), row]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      ...logNumbers(byHour.get(hour)),
    }));
  }

  /**
   * 采集量曲线（卡片头「采集量」后面的下拉：本日 / 本周 / 本月）。
   *
   * 口径与「今日采集」KPI 完全一致：`runs` 是全部运行（全量也算一次运行），其余四项只算
   * 增量采集（`LOG_SUMS` 里把 `range_type = 4` 的全量排除，否则全量那一跑会把曲线顶成尖峰）。
   * 桶的个数固定、缺的补 0：前端按索引取点，少一格就错位。
   */
  async collectSeries(range: CollectRange = 'day'): Promise<CollectSeries> {
    if (range === 'day') {
      const hours = await this.hourBuckets();
      const current = new Date().getHours();
      const buckets: CollectBucket[] = hours.map((item) => ({
        key: `${String(item.hour).padStart(2, '0')}:00`,
        ...logNumbers(item),
        partial: item.hour === current,
      }));
      return { range, unit: 'hour', buckets, totals: sumBuckets(buckets) };
    }

    const now = new Date();
    const start = rangeStart(range, now);
    const today = dayKey(now);
    const rows = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT DATE_FORMAT(started_at, '%Y-%m-%d') AS date, ${LOG_SUMS}
         FROM lcm_collect_task_log
        WHERE started_at >= ?
        GROUP BY date
        ORDER BY date`,
      // 占位符顺序跟 SQL 文本一致：`LOG_SUMS` 的 5 个在 SELECT 里，`started_at >= ?` 在最后
      [...LOG_PARAMS, dayKey(start)],
    );
    const byDate = new Map(rows.map((row) => [String(row.date), row]));

    const buckets: CollectBucket[] = [];
    for (let offset = 0; ; offset++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
      const key = dayKey(date);
      // 未来不画：本月到今天就停，不把后面几天补成 0（否则曲线尾巴永远贴着底）
      if (key > today) break;
      buckets.push({
        // 只留月-日：本日才带小时，按天的图每格都是 `11-24` 这种，轴宽够用
        key: key.slice(5),
        ...logNumbers(byDate.get(key)),
        partial: key === today,
      });
    }

    return { range, unit: 'day', buckets, totals: sumBuckets(buckets) };
  }

  /** 按天聚合的增量采集量（只返回有记录的天，补零交给调用方） */
  private async daySeries(since: string): Promise<DashboardDay[]> {
    const rows = await this.dataSource.query<
      Array<{
        date: string;
        inserted: string;
        updated: string;
        skipped: string;
        ignored: string;
        failed: string;
      }>
    >(
      `SELECT DATE_FORMAT(started_at, '%Y-%m-%d') AS date,
              COALESCE(SUM(inserted), 0) AS inserted,
              COALESCE(SUM(updated), 0) AS updated,
              COALESCE(SUM(skipped), 0) AS skipped,
              COALESCE(SUM(ignored), 0) AS ignored,
              COALESCE(SUM(failed), 0) AS failed
         FROM lcm_collect_task_log
        WHERE started_at >= ? AND range_type <> ?
        GROUP BY date
        ORDER BY date`,
      [since, FULL_RANGE],
    );
    // 驱动把 SUM() 返回成字符串，这里统一成数字，否则前端算高度会变成字符串拼接
    return rows.map((row) => ({
      date: row.date,
      inserted: Number(row.inserted) || 0,
      updated: Number(row.updated) || 0,
      skipped: Number(row.skipped) || 0,
      ignored: Number(row.ignored) || 0,
      failed: Number(row.failed) || 0,
    }));
  }

  private async categories(): Promise<Array<{ name: string; count: number }>> {
    const rows = await this.dataSource.query<Array<{ name: string; count: string }>>(
      `SELECT c.name AS name, COUNT(v.id) AS count
         FROM lcm_category c
         LEFT JOIN lcm_vod v ON v.category_pid = c.id AND v.status = 1
        WHERE c.pid = 0
        GROUP BY c.id, c.name
        ORDER BY count DESC, c.sort ASC`,
    );
    // 一级分类全给：饼图要把长尾并成「其他」，只给 Top6 就没法算了
    return rows.map((row) => ({ name: row.name, count: Number(row.count) || 0 }));
  }

  private async lines(): Promise<{
    total: number;
    items: Array<{ name: string; count: number }>;
  }> {
    // 线路注册表只是显示覆盖层，没注册的线路照样有播放地址，所以从 vod_play 聚合
    const rows = await this.dataSource.query<Array<{ name: string; count: string }>>(
      `SELECT COALESCE(NULLIF(l.name, ''), p.source_from) AS name, COUNT(*) AS count
         FROM lcm_vod_play p
         LEFT JOIN lcm_play_line l ON l.source_from = p.source_from
        WHERE p.source_from <> ''
        GROUP BY p.source_from, l.name
        ORDER BY count DESC, name ASC`,
    );
    // 不截断：卡片里是可滚动列表（和各源站的播放地址总数加起来也不多），
    // 只取前几条会让「其余 N 条未显示」永远出不来，堆叠条也缺了一块
    return {
      total: rows.length,
      items: rows.map((row) => ({ name: row.name, count: Number(row.count) || 0 })),
    };
  }

  private async pending(): Promise<DashboardSummary['pending']> {
    const [coverCheck, mergeGroups, orphanVods, failedLogs] = await Promise.all([
      this.count('SELECT COUNT(*) AS n FROM lcm_cover_check WHERE status IN (2, 3)'),
      // 与「重复影片」页同口径：同 name_hash 且年份相容的组才是可一键合并的
      this.count(
        `SELECT COUNT(*) AS n FROM (
           SELECT name_hash FROM lcm_vod WHERE name_hash <> ''
            GROUP BY name_hash
           HAVING COUNT(*) > 1 AND MIN(NULLIF(year, 0)) <=> MAX(NULLIF(year, 0))
         ) groups`,
      ),
      // 一条线路都不剩的影片，前台只能显示「暂无播放地址」
      this.count(
        `SELECT COUNT(*) AS n FROM lcm_vod v
          WHERE NOT EXISTS (SELECT 1 FROM lcm_vod_play p WHERE p.vod_id = v.id)`,
      ),
      this.count('SELECT COUNT(*) AS n FROM lcm_collect_task_log WHERE status = 3'),
    ]);
    return { coverCheck, mergeGroups, orphanVods, failedLogs };
  }

  /**
   * 今日入库：`id DESC` 与主键顺序一致，MySQL 会按主键倒序扫、命中当日就停，
   * 所以 `created_at >= CURDATE()` 只是过滤条件，不会退化成全表扫描。
   */
  private async latestVods(): Promise<LatestFeed> {
    const [rows, total] = await Promise.all([
      this.latest(
        `SELECT id, name, year, collected_at AS collectedAt, updated_at AS updatedAt
           FROM lcm_vod
          WHERE created_at >= CURDATE()
          ORDER BY id DESC
          LIMIT ?`,
      ),
      this.count('SELECT COUNT(*) AS n FROM lcm_vod WHERE created_at >= CURDATE()'),
    ]);
    return { total, items: rows };
  }

  /** 今日更新：`updated_at >= CURDATE()` 走 idx_updated_at 的区间，再按倒序取前 50 条 */
  private async latestUpdates(): Promise<LatestFeed> {
    const [rows, total] = await Promise.all([
      this.latest(
        `SELECT id, name, year, collected_at AS collectedAt, updated_at AS updatedAt
           FROM lcm_vod
          WHERE updated_at >= CURDATE()
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`,
      ),
      this.count('SELECT COUNT(*) AS n FROM lcm_vod WHERE updated_at >= CURDATE()'),
    ]);
    return { total, items: rows };
  }

  private async latest(sql: string): Promise<LatestVod[]> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        year: string;
        collectedAt: Date | null;
        updatedAt: Date | null;
      }>
    >(sql, [LATEST_COUNT]);
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      year: Number(row.year) || 0,
      collectedAt: row.collectedAt,
      updatedAt: row.updatedAt,
    }));
  }

  private async count(sql: string): Promise<number> {
    const [row] = await this.dataSource.query<Array<{ n: string }>>(sql);
    return Number(row?.n ?? 0);
  }
}
