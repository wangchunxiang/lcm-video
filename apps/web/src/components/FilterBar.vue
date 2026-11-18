<script setup lang="ts">
import { computed } from 'vue';

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
 */
const ROW = 'flex flex-wrap items-baseline gap-x-4 gap-y-1';
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
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="types.length || loadingTypes" :class="ROW">
      <span :class="LABEL">类型</span>
      <template v-if="types.length">
        <button
          v-for="option in typeOptions"
          :key="`type-${option.value}`"
          type="button"
          :class="[ITEM, option.value === type ? ACTIVE : IDLE]"
          @click="emit('update:type', option.value)"
        >
          {{ option.label }}
        </button>
      </template>
      <template v-else>
        <span
          v-for="(width, index) in TYPE_BARS"
          :key="`type-skeleton-${index}`"
          :class="BAR"
          :style="{ width: `${width}px` }"
        />
      </template>
    </div>

    <div v-if="years.length || loadingYears" :class="ROW">
      <span :class="LABEL">年份</span>
      <template v-if="years.length">
        <button
          v-for="option in yearOptions"
          :key="`year-${option.value}`"
          type="button"
          :class="[ITEM, option.value === year ? ACTIVE : IDLE]"
          @click="emit('update:year', option.value)"
        >
          {{ option.label }}
        </button>
      </template>
      <template v-else>
        <span
          v-for="(width, index) in YEAR_BARS"
          :key="`year-skeleton-${index}`"
          :class="BAR"
          :style="{ width: `${width}px` }"
        />
      </template>
    </div>

    <div :class="ROW">
      <span :class="LABEL">排序</span>
      <button
        v-for="option in sortOptions"
        :key="`sort-${option.value}`"
        type="button"
        :class="[ITEM, option.value === sort ? ACTIVE : IDLE]"
        @click="emit('update:sort', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
