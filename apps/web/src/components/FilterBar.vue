<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  types: { id: string; name: string; alias: string }[];
  years: number[];
  type: string;
  year: string;
  sort: string;
  /** 类型/年份还没回来时，先用等高的骨架条占位，筛选项出现时不会把下面的海报网格顶下去 */
  loadingTypes?: boolean;
  loadingYears?: boolean;
}>();

const emit = defineEmits<{
  'update:type': [value: string];
  'update:year': [value: string];
  'update:sort': [value: string];
}>();

interface Option {
  value: string;
  label: string;
}

const typeOptions = computed<Option[]>(() => [
  { value: '', label: '全部' },
  ...props.types.map((item) => ({ value: item.alias, label: item.name })),
]);
const yearOptions = computed<Option[]>(() => [
  { value: '', label: '全部' },
  ...props.years.map((item) => ({ value: String(item), label: String(item) })),
]);
const sortOptions: Option[] = [
  { value: 'time', label: '最近更新' },
  { value: 'new', label: '最新入库' },
];

/**
 * 纯文字，不做按钮/胶囊：选中变强调色，hover 变白。
 * 字号按「标签 13px < 条目 14px < 片名 16px」分层，别和海报标题抢层级。
 * 一级分类不在这里切——顶栏导航已经有了，这里只做当前分类下的类型/年份/排序。
 *
 * 小屏不换行：类型/年份都有 15+ 项，一换行就是三四行、直接吃掉半屏。
 * 改成「标签固定 + 条目横向滑动」，滚动条隐藏（与顶栏分类同一做法），sm 起恢复换行。
 */
const ROW = 'flex items-center gap-x-4 sm:flex-wrap sm:items-baseline sm:gap-y-1';
const STRIP =
  'flex min-w-0 flex-1 items-center gap-x-4 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:items-baseline sm:gap-y-1 sm:overflow-visible';
const LABEL = 'w-8 flex-none text-small text-ink-3';
const ITEM = 'cursor-pointer text-body leading-6 transition';
const ACTIVE = 'text-primary';
const IDLE = 'text-ink-2 hover:text-ink';
const BAR = 'h-6 self-center animate-pulse rounded bg-surface-2';

/**
 * 占位条宽度按现有数据取：每个一级分类的「类型」是 6~16 项、年份固定最多 15 项（+「全部」）。
 * 这里按条目最多的「电影」画 16 条，标题条宽度也贴近真实文字，首屏落地分类的行数与真选项一致。
 */
const TYPE_BARS = [28, ...Array.from({ length: 15 }, () => 42)];
const YEAR_BARS = [28, ...Array.from({ length: 15 }, () => 31)];

const typeStrip = ref<HTMLElement | null>(null);
const yearStrip = ref<HTMLElement | null>(null);

/**
 * 小屏横向滑动时，选中项可能在可视区外（带 ?year=2019 的直链、返回上一页都会）：
 * 首次渲染/筛选项回来后把它滚到中间。只在真的能横滑时（scrollWidth > clientWidth）动，
 * 桌面端 overflow-visible 不触发，不会抢页面滚动。
 */
function revealActive(strip: HTMLElement | null): void {
  if (!strip || strip.scrollWidth <= strip.clientWidth) return;
  const active = strip.querySelector<HTMLElement>('[data-active]');
  if (!active) return;
  const stripRect = strip.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const delta = activeRect.left - stripRect.left - (stripRect.width - activeRect.width) / 2;
  strip.scrollTo({ left: Math.max(0, strip.scrollLeft + delta), behavior: 'smooth' });
}

function revealAll(): void {
  revealActive(typeStrip.value);
  revealActive(yearStrip.value);
}

// 筛选项是异步回来的（骨架 → 真条目），长度变化的那一拍再对齐一次
watch(() => [props.types.length, props.years.length], revealAll, { flush: 'post' });
onMounted(revealAll);
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="types.length || loadingTypes" :class="ROW">
      <span :class="LABEL">类型</span>
      <div ref="typeStrip" :class="STRIP">
        <template v-if="types.length">
          <button
            v-for="option in typeOptions"
            :key="`type-${option.value}`"
            type="button"
            :data-active="option.value === type ? 'true' : undefined"
            :class="[ITEM, 'flex-none', option.value === type ? ACTIVE : IDLE]"
            @click="emit('update:type', option.value)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else>
          <span
            v-for="(width, index) in TYPE_BARS"
            :key="`type-skeleton-${index}`"
            :class="[BAR, 'flex-none']"
            :style="{ width: `${width}px` }"
          />
        </template>
      </div>
    </div>

    <div v-if="years.length || loadingYears" :class="ROW">
      <span :class="LABEL">年份</span>
      <div ref="yearStrip" :class="STRIP">
        <template v-if="years.length">
          <button
            v-for="option in yearOptions"
            :key="`year-${option.value}`"
            type="button"
            :data-active="option.value === year ? 'true' : undefined"
            :class="[ITEM, 'flex-none', option.value === year ? ACTIVE : IDLE]"
            @click="emit('update:year', option.value)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else>
          <span
            v-for="(width, index) in YEAR_BARS"
            :key="`year-skeleton-${index}`"
            :class="[BAR, 'flex-none']"
            :style="{ width: `${width}px` }"
          />
        </template>
      </div>
    </div>

    <div :class="ROW">
      <span :class="LABEL">排序</span>
      <div :class="STRIP">
        <button
          v-for="option in sortOptions"
          :key="`sort-${option.value}`"
          type="button"
          :class="[ITEM, 'flex-none', option.value === sort ? ACTIVE : IDLE]"
          @click="emit('update:sort', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
  </div>
</template>
