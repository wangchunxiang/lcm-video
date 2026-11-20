import { computed, onUnmounted, ref, type Ref, watch } from 'vue';

/** 选集格子的最小信息：集号 + 集名 */
export interface EpisodeLike {
  index: number;
  name: string;
}

export interface EpisodeCell extends EpisodeLike {
  /** 这一格要跨几列（1–4） */
  span: number;
}

/** 与 tokens.css 的 --ep-gap 一致：估跨度时要把格子之间的间距算进去 */
const EP_GAP = 8;
/** 跨 2 格以上时的左右内边距（px-2），估宽度时预留 */
const EP_PADDING = 16;
/** 12px 字号（text-caption）：一个全角字占 12px */
const EP_FONT = 12;
/** 最多跨 4 格；再宽也只在 4 格里单行省略，与以前的观感一致 */
const EP_MAX_SPAN = 4;
/**
 * 只在小屏（Tailwind 的 sm 断点以下）才按名字宽度跨列。
 * PC 上 8/10 列本来一格就有一百多 px，跨列会把格子撑成一块大色块、也打乱「数格子」的节奏。
 */
const COMPACT_QUERY = '(max-width: 639px)';

/** 名字有多宽，以「全角字」为单位：全角/CJK 计 1，半角按 0.55 折算 */
export function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += /[\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]/.test(ch) ? 1 : 0.55;
  }
  return width;
}

/**
 * 这一格要跨几列：名字多宽就占几列，取第一个装得下的跨度。
 * 跨 N 格的实际宽度 = N * 格宽 + (N - 1) * 间距，所以不能直接 width / 格宽 取整。
 * grid 的自动放置不会回填空洞（开 dense 会打乱集序），剩下的空位就让它空着。
 */
export function episodeSpan(name: string, cellWidth: number): number {
  if (cellWidth <= 0) return 1;
  const needed = textWidth(name) * EP_FONT + EP_PADDING;
  for (let span = 1; span < EP_MAX_SPAN; span += 1) {
    if (span * cellWidth + (span - 1) * EP_GAP >= needed) return span;
  }
  return EP_MAX_SPAN;
}

/**
 * 选集网格的动态跨列：小屏 4 列、xl 10 列，同一份 DOM 每个断点的格宽都不同，
 * 只能量出来再算；量到之前一律按 1 格排，避免首帧闪动。
 * 详情页与播放页共用这一套（两处的网格列数、`--ep-*` 令牌完全相同）。
 */
export function useEpisodeCells<T extends EpisodeLike>(
  episodes: Ref<T[]>,
  gridRef: Ref<HTMLDivElement | null>,
): { episodeCells: Ref<EpisodeCell[]> } {
  /** 一格宽（px），0 表示还没量到 */
  const cellWidth = ref(0);
  /** 是否小屏：只有小屏才启用动态跨列 */
  const compact = ref(false);

  let query: MediaQueryList | undefined;
  function onCompactChange(event: MediaQueryListEvent): void {
    compact.value = event.matches;
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    query = window.matchMedia(COMPACT_QUERY);
    compact.value = query.matches;
    query.addEventListener('change', onCompactChange);
  }

  function measure(): void {
    const grid = gridRef.value;
    if (!grid) return;
    const template = getComputedStyle(grid).gridTemplateColumns;
    const first = Number.parseFloat(template.split(' ')[0] ?? '');
    if (Number.isFinite(first) && first > 0) {
      cellWidth.value = first;
      return;
    }
    // 还没布局完时浏览器可能原样返回 repeat(4, minmax(0px, 1fr))，这时按列数倒推
    const count = Number(/repeat\((\d+)/.exec(template)?.[1] ?? 0) || 4;
    cellWidth.value = Math.max(0, (grid.clientWidth - EP_GAP * (count - 1)) / count);
  }

  let observer: ResizeObserver | undefined;

  // 选集区随数据/线路切换才渲染，所以要盯着 ref：元素一出现就量一次并挂上观察器
  watch(gridRef, (grid) => {
    observer?.disconnect();
    observer = undefined;
    if (!grid) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(() => measure());
    observer.observe(grid);
  });

  onUnmounted(() => {
    observer?.disconnect();
    query?.removeEventListener('change', onCompactChange);
  });

  // span = 1 时模板不加 `grid-column` 也不改对齐，所以 PC 上的样式与改动前一模一样
  const episodeCells = computed<EpisodeCell[]>(() =>
    episodes.value.map((ep) => ({
      ...ep,
      span: compact.value ? episodeSpan(ep.name, cellWidth.value) : 1,
    })),
  );

  return { episodeCells };
}
