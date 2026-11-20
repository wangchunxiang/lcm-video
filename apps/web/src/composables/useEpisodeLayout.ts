import { computed, onUnmounted, ref, type Ref, watch } from 'vue';

/** 选集格子的最小信息：集号 + 集名 */
export interface EpisodeLike {
  index: number;
  name: string;
}

/** 与 tokens.css 的 --ep-gap 一致：算可用宽度时要把格子之间的间距算进去 */
const EP_GAP = 8;
/** 12px 字号（text-caption）：一个全角字占 12px */
const EP_FONT = 12;
/** 网格布局下没有内边距，文字直接铺满格子 */
const EP_GRID_PADDING = 4;

/**
 * 只在小屏（Tailwind 的 sm 断点以下）才考虑改版式。
 * PC 上 8/10 列、一格一百多 px，绝大多数集名天然放得下，版式不用动。
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

/** 这个名字排成一行实际要多少 px（估算，含内边距） */
export function nameWidth(name: string, padding = EP_GRID_PADDING): number {
  return textWidth(name) * EP_FONT + padding;
}

/**
 * 小屏选集版式：
 * - `grid`：4 列网格，所有集名都在一格内放得下 —— 保持整齐、能「数格子」；
 * - `flow`：只要有一个名字一格放不下，整块改用 flex-wrap 自然宽度（每个格子按内容宽度），
 *   长的名字不会被切、也不会出现「一行 2 个 + 右边空一大块」的空洞。
 * PC 上一律返回 `grid`。
 */
export type EpisodeLayout = 'grid' | 'flow';

export function useEpisodeLayout<T extends EpisodeLike>(
  episodes: Ref<T[]>,
  gridRef: Ref<HTMLDivElement | null>,
): { layout: Ref<EpisodeLayout> } {
  /** 一格宽（px），0 表示还没量到 */
  const cellWidth = ref(0);
  /** 是否小屏 */
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
    // 量的时候网格可能正处在 flow 状态（那是 flex），此时退回到容器宽度按 4 列折算
    const template = getComputedStyle(grid).gridTemplateColumns;
    const first = Number.parseFloat(template.split(' ')[0] ?? '');
    if (Number.isFinite(first) && first > 0) {
      cellWidth.value = first;
      return;
    }
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

  const layout = computed<EpisodeLayout>(() => {
    if (!compact.value || cellWidth.value <= 0) return 'grid';
    const overflow = episodes.value.some((ep) => nameWidth(ep.name) > cellWidth.value);
    return overflow ? 'flow' : 'grid';
  });

  return { layout };
}
