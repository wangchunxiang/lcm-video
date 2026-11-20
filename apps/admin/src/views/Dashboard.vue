<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.ts';
import { formatShortTime } from '../utils/datetime.ts';
import type { EChartsOption } from '../utils/echarts.ts';

// 趋势图是首页唯一的重量级依赖（echarts + 折线图，压缩后约 190KB）：异步加载。
// 首屏先出布局与数字，图表 chunk 到达后再渲染，避免首页背着一个静态 import。
// 类型用 `import type` 单独引入——只在编译期存在，不会把 utils/echarts.ts 拉回首屏。
const VChart = defineAsyncComponent(() => import('../utils/echarts.ts').then((mod) => mod.VChart));

interface DayPoint {
  date: string;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

interface HourPoint {
  hour: number;
  runs: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

interface DashboardData {
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
  trend: DayPoint[];
  hours: HourPoint[];
  categories: Array<{ name: string; count: number }>;
  lines: { total: number; items: Array<{ name: string; count: number }> };
  pending: { coverCheck: number; mergeGroups: number; orphanVods: number; failedLogs: number };
  latestVods: LatestFeed;
  latestUpdates: LatestFeed;
}

interface LatestFeed {
  total: number;
  items: LatestVod[];
}

interface LatestVod {
  id: string;
  name: string;
  year: number;
  collectedAt: string | null;
  updatedAt: string | null;
}

const loading = ref(false);
const data = ref<DashboardData | null>(null);

const LINE_COLORS = ['#409eff', '#67c23a', '#e6a23c', '#909399'];

/** 千分位，图表轴标签和数字块共用 */
function comma(value: number): string {
  return value.toLocaleString('zh-CN');
}

/* ── 顶部四卡 ───────────────────────────────────────── */

const pendingTotal = computed(() => {
  const pending = data.value?.pending;
  if (!pending) return 0;
  return pending.coverCheck + pending.mergeGroups + pending.orphanVods + pending.failedLogs;
});

const pendingEmpty = computed(() => pendingTotal.value === 0);

/** 第二行太窄时用 tooltip 补全（四段明细在 1280px 屏上会被省略号切掉） */
const pendingHint = computed(() => {
  const pending = data.value?.pending;
  if (!pending) return '';
  return `图片 ${pending.coverCheck} · 重复影片 ${pending.mergeGroups} · 无播放地址 ${pending.orphanVods} · 采集失败 ${pending.failedLogs}`;
});

/** 近 7 天净增（含今天），给「影片总数」卡一个增长参照 */
const weekGain = computed(() =>
  (data.value?.trend ?? []).slice(-7).reduce((sum, day) => sum + day.inserted, 0),
);

/** 今日入库比昨天多/少多少，昨天为 0 时只说绝对值 */
const insertedDelta = computed<string | null>(() => {
  const trend = data.value?.trend ?? [];
  const today = data.value?.todayLog.inserted ?? 0;
  const yesterday = trend[trend.length - 2]?.inserted ?? 0;
  if (yesterday === 0) return today === 0 ? '昨天也没有新片' : `昨天 0 部，今天 ${comma(today)} 部`;
  const percent = Math.round(((today - yesterday) / yesterday) * 100);
  if (percent === 0) return `与昨天持平（${comma(yesterday)} 部）`;
  return `${percent > 0 ? '比昨天多' : '比昨天少'} ${Math.abs(percent)}%（昨天 ${comma(yesterday)} 部）`;
});

/** 今日入库的短同比，放卡片右下角（长句在 tooltip 里） */
const insertedDeltaShort = computed(() => {
  const trend = data.value?.trend ?? [];
  const today = data.value?.todayLog.inserted ?? 0;
  const yesterday = trend[trend.length - 2]?.inserted ?? 0;
  if (yesterday === 0) return today === 0 ? '昨天也 0' : '昨天 0';
  const percent = Math.round(((today - yesterday) / yesterday) * 100);
  if (percent === 0) return '与昨天持平';
  return `${percent > 0 ? '↑' : '↓'} ${Math.abs(percent)}%`;
});

const insertedDeltaUp = computed(() => {
  const trend = data.value?.trend ?? [];
  return (data.value?.todayLog.inserted ?? 0) >= (trend[trend.length - 2]?.inserted ?? 0);
});

/* ── 采集维度与图表选项 ─────────────────────────── */

/* ── 采集维度（两张图共用同一套标签与配色） ─────────── */

/** 一次采集的四种去向 + 异常。新增蓝、更新绿、跳过灰（本来就没变化）、忽略橙（被规则滤掉）、失败红 */
const DIMENSIONS = [
  { key: 'inserted', label: '新增', color: '#409eff' },
  { key: 'updated', label: '更新', color: '#67c23a' },
  { key: 'ignored', label: '忽略', color: '#e6a23c' },
  { key: 'failed', label: '失败', color: '#f56c6c' },
  // 跳过放最后：量级压过其他四项，图例里排末尾，默认还是关着的
  { key: 'skipped', label: '跳过', color: '#909399' },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]['key'];

const AXIS_LABEL = { color: '#c0c4cc', fontSize: 10, margin: 8 };
const LEGEND = {
  top: 0,
  right: 0,
  icon: 'roundRect' as const,
  itemWidth: 9,
  itemHeight: 8,
  itemGap: 10,
  textStyle: { fontSize: 11, color: '#909399' },
};

/**
 * 「跳过」量级压过其他维度（一次运行典型是 4~16 增 / 6~46 更 / 59~100 跳过），
 * 共用一根 Y 轴时它贴顶左右摆、把新增更新压成底部一小段，所以默认关掉，点图例一键打开。
 */
const LEGEND_DEFAULT = { ...LEGEND, selected: { 跳过: false } };
const GRID = { left: 4, right: 8, top: 24, bottom: 0, containLabel: true };
const VALUE_AXIS = {
  type: 'value' as const,
  splitLine: { lineStyle: { color: '#f5f7fa' } },
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#c0c4cc', fontSize: 10, margin: 6 },
};

/** tooltip 统一格式：日期/时间标题 + 五个维度各一行，数字后面都跟「部」 */
function tooltipRows(params: unknown, footer?: string): string {
  const rows = params as Array<{
    axisValue?: string;
    dataIndex?: number;
    marker?: string;
    seriesName?: string;
    value?: number;
  }>;
  if (rows.length === 0) return '';
  const head = `<div style="margin-bottom:4px;color:#909399">${rows[0]?.axisValue ?? ''}</div>`;
  const body = rows
    .map(
      (row) =>
        `${row.marker ?? ''}<span style="display:inline-block;min-width:28px;color:#606266">${row.seriesName ?? ''}</span>` +
        `<b style="margin-left:10px;font-variant-numeric:tabular-nums">${comma(Number(row.value) || 0)}</b>`,
    )
    .join('<br/>');
  const tail = footer === undefined ? '' : `<div style="margin-top:4px;color:#909399">${footer}</div>`;
  return head + body + tail;
}

/* ── 两张图共用的折线构造 ────────────────────── */

/**
 * 五条折线（只有新增带面积）。两张图都画同一个东西，只是横轴不同：
 * 今日采集用 24 个小时，趋势用 8 天，所以只把「取数据」这件事交给调用方。
 */
function dimensionLines<T>(
  rows: T[],
  pick: (row: T, key: DimensionKey) => number,
): NonNullable<EChartsOption['series']> {
  const series = DIMENSIONS.map((dim) => ({
    name: dim.label,
    type: 'line' as const,
    data: rows.map((row) => pick(row, dim.key)),
    showSymbol: false,
    // 平滑曲线：0.3 比默认 0.5 克制，不会在两个数据点之间凭空拱出一座小山；
    // smoothMonotone 再禁掉「回勾」——不然 0→101 这种跳变会在低值那头画出负值假象
    smooth: 0.3,
    smoothMonotone: 'x' as const,
    lineStyle: { width: 2, color: dim.color },
    itemStyle: { color: dim.color },
    emphasis: { focus: 'series' as const, scale: false },
    // 只有新增带面积，否则五层半透明叠在一起变成一坨灰
    ...(dim.key === 'inserted'
      ? {
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${dim.color}38` },
                { offset: 1, color: `${dim.color}00` },
              ],
            },
          },
        }
      : {}),
  }));
  // ECharts 的 series 是 20 多种图类型的联合类型，这里只装箱不取值，交回给 option 校验
  return series as NonNullable<EChartsOption['series']>;
}

/* ── 今日采集（按小时） ──────────────────────── */

const todayOption = computed<EChartsOption | null>(() => {
  const hours = data.value?.hours ?? [];
  if (hours.length === 0) return null;

  return {
    grid: GRID,
    legend: LEGEND_DEFAULT,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#dcdfe6', width: 1 } },
      backgroundColor: '#fff',
      borderColor: '#ebeef5',
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: '#303133', fontSize: 12 },
      extraCssText: 'border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.08);',
      formatter: (params: unknown): string => {
        const rows = params as Array<{ dataIndex?: number }>;
        const runs = hours[rows[0]?.dataIndex ?? 0]?.runs ?? 0;
        return tooltipRows(params, `${runs} 次运行`);
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hours.map((item) => `${String(item.hour).padStart(2, '0')}:00`),
      axisLine: { lineStyle: { color: '#ebeef5' } },
      axisTick: { show: false },
      // 24 个刻度写满会糊成一片，每 3 小时一个
      axisLabel: { ...AXIS_LABEL, interval: 2 },
    },
    yAxis: VALUE_AXIS,
    series: dimensionLines(hours, (item, key) => item[key]),
  };
});

/* ── 采集趋势（近 7 天） ──────────────────────── */

/* ── 线路 / 分类分布 ───────────────────────────────── */

const lineTotal = computed(() => data.value?.lines.items.reduce((sum, item) => sum + item.count, 0) ?? 0);

/* 后端按播放地址数倒序返回全部线路；列表可滚，颜色只给前 4 条，其余统一灰 */
const lineRows = computed(() => {
  const items = data.value?.lines.items ?? [];
  const total = lineTotal.value || 1;
  return items.map((item, index) => ({
    name: item.name,
    count: item.count,
    percent: (item.count / total) * 100,
    color: LINE_COLORS[index] ?? '#c0c4cc',
  }));
});

/* 堆叠条最多 4 段：段数再多就认不出颜色了，第 5 条起并成「其他」 */
const STACK_SLICES = 4;

const lineStack = computed(() => {
  const rows = lineRows.value;
  if (rows.length <= STACK_SLICES) return rows;
  const head = rows.slice(0, STACK_SLICES);
  const rest = rows.slice(STACK_SLICES);
  return [
    ...head,
    {
      name: `其他 ${rest.length} 条`,
      count: rest.reduce((sum, row) => sum + row.count, 0),
      percent: rest.reduce((sum, row) => sum + row.percent, 0),
      color: '#c0c4cc',
    },
  ];
});

const CATEGORY_SLICES = 6;

/* ── 分类饼图 ───────────────────────────────────────── */

const categoryOption = computed<EChartsOption | null>(() => {
  const items = [...(data.value?.categories ?? [])].sort((a, b) => b.count - a.count);
  if (items.length === 0) return null;

  // 一级分类有二十来个，全画进饼里看不清：留前 6 个，长尾并成「其他」
  const head = items.slice(0, CATEGORY_SLICES);
  const rest = items.slice(CATEGORY_SLICES);
  const restCount = rest.reduce((sum, item) => sum + item.count, 0);
  const slices =
    restCount > 0 ? [...head, { name: `其他 ${rest.length} 个`, count: restCount }] : head;
  const total = slices.reduce((sum, item) => sum + item.count, 0);

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#fff',
      borderColor: '#ebeef5',
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: '#303133', fontSize: 12 },
      extraCssText: 'border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.08);',
      formatter: (params: unknown): string => {
        const item = params as { name?: string; value?: number };
        const count = item.value ?? 0;
        return [
          `<div style="font-weight:600;margin-bottom:4px">${item.name ?? ''}</div>`,
          `<div>${comma(count)} 部 · ${((count / (total || 1)) * 100).toFixed(1)}%</div>`,
        ].join('');
      },
    },
    /*
     * 实心饼 + 外置引线标签：
     * - 不放图例，名字和占比都写在引线末端，省下一个图例的纵向空间（卡片本来就窄）；
     * - `alignTo: 'edge'` 让标签贴着左右两侧的边缘排开，`hideOverlap` 兜底丢掉实在放不下的，
     *   否则窄卡里 7 个标签会叠在一起。
     */
    series: [
      {
        type: 'pie',
        radius: '62%',
        center: ['50%', '50%'],
        minAngle: 4,
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: 'outside',
          formatter: '{b} {d}%',
          fontSize: 11,
          color: '#606266',
        },
        labelLine: {
          show: true,
          length: 8,
          length2: 10,
          smooth: true,
          lineStyle: { color: '#c9cdd4', width: 1 },
        },
        labelLayout: { alignTo: 'edge', edgeDistance: 4, hideOverlap: true },
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 2 },
        emphasis: { scale: true, scaleSize: 5, label: { fontWeight: 600, color: '#303133' } },
        data: slices.map((item) => ({ name: item.name, value: item.count })),
      },
    ],
  };
});

/* ── 数据新鲜度 ─────────────────────────────────────── */

const successRate = computed(() => {
  const log = data.value?.todayLog;
  if (!log || log.runs === 0) return 100;
  return Math.round(((log.runs - log.failed) / log.runs) * 100);
});

/* ── 加载 ───────────────────────────────────────────── */

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await api.get<DashboardData>('/dashboard/summary');
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  // 静态资源空闲时就把图表 chunk 取回来：首屏不等它，但用户滚到那里时通常已经就绪
  const prefetch = (): void => {
    void import('../utils/echarts.ts');
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(prefetch, { timeout: 2_000 });
  else setTimeout(prefetch, 1_000);
});
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <div class="stats">
      <section class="stat stat-film">
        <div class="stat-top">
          <span class="stat-label">影片总数</span>
          <span class="stat-value">{{ comma(data?.vod.total ?? 0) }}</span>
        </div>
        <div class="stat-bot">
          <span class="stat-sub">
            在架 {{ comma(data?.vod.enabled ?? 0) }} · 下架 {{ comma(data?.vod.disabled ?? 0) }}
          </span>
          <span class="stat-delta up">+{{ comma(weekGain) }} / 7 天</span>
        </div>
      </section>

      <section class="stat stat-grow">
        <div class="stat-top">
          <span class="stat-label">今日入库</span>
          <span class="stat-value">{{ comma(data?.todayLog.inserted ?? 0) }}</span>
        </div>
        <div class="stat-bot">
          <span class="stat-sub">
            更新 {{ comma(data?.todayLog.updated ?? 0) }} · 失败
            <span :class="{ 'stat-bad': (data?.todayLog.failed ?? 0) > 0 }">
              {{ comma(data?.todayLog.failed ?? 0) }}
            </span>
          </span>
          <span
            class="stat-delta"
            :class="insertedDeltaUp ? 'up' : 'down'"
            :title="insertedDelta ?? ''"
          >
            {{ insertedDeltaShort }}
          </span>
        </div>
      </section>

      <section class="stat stat-health">
        <div class="stat-top">
          <span class="stat-label">今日采集成功率</span>
          <span class="stat-value" :class="{ 'stat-bad': successRate < 100 }">{{ successRate }}<i>%</i></span>
        </div>
        <div class="stat-bot">
          <span class="stat-sub">
            {{ comma(data?.todayLog.runs ?? 0) }} 次运行 · 跳过 {{ comma(data?.todayLog.skipped ?? 0) }} 部
          </span>
          <span class="stat-delta" :class="(data?.todayLog.failed ?? 0) > 0 ? 'down' : 'up'">
            失败 {{ comma(data?.todayLog.failed ?? 0) }} 次
          </span>
        </div>
      </section>

      <!-- 待处理：侧边条只是四张卡的区分色，不随内容变 -->
      <section class="stat stat-todo">
        <div class="stat-top">
          <span class="stat-label">待处理</span>
          <span
            class="stat-value"
            :class="{ 'stat-bad': pendingTotal > 0 }"
            :title="pendingEmpty ? '四个检查维度都是 0' : ''"
          >
            {{ comma(pendingTotal) }}
          </span>
        </div>
        <div class="stat-bot">
          <span class="stat-sub" :title="pendingHint">
            图片 {{ data?.pending.coverCheck ?? 0 }} · 重复 {{ data?.pending.mergeGroups ?? 0 }} · 无地址
            {{ data?.pending.orphanVods ?? 0 }} · 失败 {{ data?.pending.failedLogs ?? 0 }}
          </span>
          <span class="stat-delta" :class="pendingTotal > 0 ? 'down' : 'up'">
            {{ pendingTotal > 0 ? `${pendingTotal} 项` : '全部处理完' }}
          </span>
        </div>
      </section>
    </div>

    <div class="grid">
      <!-- ② 第一行左：分类饼图 -->
      <section class="card card-narrow">
        <header class="card-head">
          <span>分类影片数</span>
        </header>
        <div class="card-body pie-body">
          <VChart v-if="categoryOption" class="chart" :option="categoryOption" autoresize />
          <el-empty v-else description="还没有分类" :image-size="48" />
        </div>
      </section>

      <!-- ③ 第一行右：今日采集（按小时），横跨两列 -->
      <section class="card card-wide">
        <header class="card-head">
          <span>今日采集</span>
          <span class="card-sub">{{ data?.todayLog.runs ?? 0 }} 次运行</span>
        </header>
        <div class="card-body chart-body">
          <VChart v-if="todayOption" class="chart" :option="todayOption" autoresize />
          <el-empty v-else description="今天还没有采集" :image-size="56" />
        </div>
      </section>

      <!-- ④ 第二行左：线路分布 -->
      <section class="card card-narrow">
        <header class="card-head">
          <span>线路分布</span>
          <span class="card-sub">{{ data?.lines.total ?? 0 }} 条线路</span>
        </header>
        <div class="card-body line-body">
          <div v-if="lineRows.length > 0" class="stack">
            <i
              v-for="row in lineStack"
              :key="row.name"
              :style="{ width: `${row.percent}%`, background: row.color }"
              :title="`${row.name} ${comma(row.count)}`"
            />
          </div>
          <!-- 线路多了在这条列表里滚，滚动条与「今日更新 / 今日入库」同款 -->
          <div class="line-list feed-body">
            <div v-for="row in lineRows" :key="row.name" class="line-item" :title="row.name">
              <span class="line-swatch" :style="{ background: row.color }" />
              <span class="line-name">{{ row.name }}</span>
              <span class="line-count">{{ comma(row.count) }}</span>
            </div>
          </div>
          <el-empty v-if="lineRows.length === 0" description="还没有播放地址" :image-size="48" />
        </div>
      </section>

      <!-- ⑤ 第二行中：今日更新（updated_at 倒序） -->
      <section class="card card-half">
        <header class="card-head">
          <span>今日更新</span>
          <span class="card-sub">今日 {{ comma(data?.latestUpdates.total ?? 0) }} 部</span>
        </header>
        <div class="card-body feed-body">
          <div v-if="(data?.latestUpdates.items ?? []).length > 0" class="feed">
            <div v-for="item in data?.latestUpdates.items ?? []" :key="item.id" class="feed-item">
              <span class="feed-name" :title="item.name">{{ item.name }}</span>
              <span class="feed-meta">{{ item.year > 0 ? item.year : '—' }}</span>
              <span class="feed-time">{{ formatShortTime(item.updatedAt) }}</span>
            </div>
          </div>
          <el-empty v-else description="还没有更新记录" :image-size="48" />
        </div>
      </section>

      <!-- ⑥ 第二行右：今日入库（写入顺序） -->
      <section class="card card-half">
        <header class="card-head">
          <span>今日入库</span>
          <span class="card-sub">今日 {{ comma(data?.latestVods.total ?? 0) }} 部</span>
        </header>
        <div class="card-body feed-body">
          <div v-if="(data?.latestVods.items ?? []).length > 0" class="feed">
            <div v-for="item in data?.latestVods.items ?? []" :key="item.id" class="feed-item">
              <span class="feed-name" :title="item.name">{{ item.name }}</span>
              <span class="feed-meta">{{ item.year > 0 ? item.year : '—' }}</span>
              <span class="feed-time">{{ formatShortTime(item.collectedAt) }}</span>
            </div>
          </div>
          <el-empty v-else description="还没有影片" :image-size="48" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 整页不滚动：高度吃满 el-main，内容超了只在卡片内部滚 */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

/* ── 顶部四卡 ───────────────────────────────────────── */
.stats {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.stat {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  min-height: 70px;
  padding: 11px 14px 11px 17px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
}
/* 左侧 3px 色条：四张卡的区分色（用 Element Plus 调色板的四色），纯装饰，不随数值变 */
.stat::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--el-border-color);
}
.stat-film::before {
  background: var(--el-color-primary);
}
.stat-grow::before {
  background: var(--el-color-success);
}
.stat-health::before {
  background: var(--el-color-warning);
}
.stat-todo::before {
  background: var(--el-color-danger);
}
.stat-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
}
.stat-label {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-value {
  flex: none;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.stat-value i {
  margin-left: 1px;
  font-size: 14px;
  font-style: normal;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}
.stat-value.stat-bad {
  color: var(--el-color-danger);
}
.stat-bot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
/* flex:1 1 0 是省略号生效的前提：不写 flex，flex 子项的 min-width 就是内容宽度，
   长明细会把右侧的对照值顶出卡片（1280px 屏上「待处理」那张必现） */
.stat-sub {
  flex: 1 1 0;
  min-width: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-bad {
  color: var(--el-color-danger);
}
.stat-delta {
  flex: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-placeholder);
}
.stat-delta.up {
  color: var(--el-color-success);
}
.stat-delta.down {
  color: var(--el-color-danger);
}

/* ── 栅格：四列两行（列宽与顶部四卡一致） ────────────── */
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  /* 八等分：左列 2 格 = 第一张 KPI 卡的宽度（竖线对得上），第二行剩下 6 格给两张列表平分 */
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

/* 窄卡：左列（饼图、线路分布），2 格 = 顶部一张 KPI 卡的宽度 */
.card-narrow {
  grid-column: span 2;
}
/* 第一行右：今日采集吃掉剩下的 6 格 */
.card-wide {
  grid-column: span 6;
}
/* 第二行中右：今日更新 / 今日入库 各 3 格，平均分 */
.card-half {
  grid-column: span 3;
}

/* ── 饼图 ───────────────────────────────────────────── */
/* ── 最新更新 / 最新入库 ───────────────────────────── */
/*
 * 滚动条对齐侧栏用的 el-scrollbar：6px 宽、圆角、平时透明、鼠标在卡片里才显形。
 * 这里用原生滚动条（两张列表的数据量不需要 el-scrollbar 的虚拟滚动），
 * `scrollbar-width/color` 给 Firefox，`::-webkit-scrollbar` 给 Chromium/Safari。
 * 宽度固定 6px 也顺带避免「滚动条出现→内容横向跳一下」。
 */
.feed-body {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.feed-body:hover {
  scrollbar-color: var(--el-scrollbar-bg-color, rgba(144, 147, 153, 0.4)) transparent;
}
.feed-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.feed-body::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background-color: transparent;
  transition: background-color 0.2s;
}
.feed-body:hover::-webkit-scrollbar-thumb {
  background-color: var(--el-scrollbar-bg-color, rgba(144, 147, 153, 0.4));
}
.feed-body::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-scrollbar-hover-bg-color, rgba(144, 147, 153, 0.55));
}
.feed-body::-webkit-scrollbar-track {
  background: transparent;
}
.feed {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.feed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.feed-item:last-child {
  border-bottom: none;
}
.feed-name {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}
.feed-meta {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}
.feed-time {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

/* ── 卡片壳 ─────────────────────────────────────────── */
.card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
}
.card-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.card-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.card-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 14px;
}

/* ── 图表 ───────────────────────────────────────────── */
.pie-body {
  display: flex;
  /* 左右留 2px 就够：外置标签靠 ECharts 的 edgeDistance 自己收边，留多了反而挤扁饼 */
  padding: 4px 2px 2px;
}
.chart-body {
  display: flex;
  padding: 6px 10px 4px;
}
/* ECharts 画在 canvas 上，容器必须有确定高度（父卡片给了 flex:1 + min-height:0） */
.chart {
  width: 100%;
  height: 100%;
  min-height: 120px;
}

/* ── 线路分布 ───────────────────────────────────────── */
.line-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 正文自己不滚，滚动交给下面的列表，堆叠条才能钉在顶上 */
  overflow: hidden;
}
.stack {
  flex: none;
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}
.stack i {
  display: block;
  height: 100%;
}
.line-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.line-item {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.line-swatch {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.line-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}
.line-count {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}
</style>
