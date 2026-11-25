<script setup lang="ts">
import type { VodCard as VodCardData } from '../api/portal';
import VodGrid from './VodGrid.vue';
import { ChevronRight } from 'lucide-vue-next';

/**
 * 首页区块：标题 + 「更多」+ 海报网格。
 *
 * 大屏按 8 列 × 2 行排（每块 16 部），列数沿用 VodGrid 的断点，窄屏自动折行。
 */
withDefaults(
  defineProps<{
    title: string;
    /** 标题后的小字说明，可选 */
    sub?: string;
    /** 「更多」跳转地址，可选 */
    more?: string;
    items: VodCardData[];
    /** 前 N 张 eager 加载，首屏以外的区块保持默认 0（全 lazy） */
    eagerCount?: number;
  }>(),
  { eagerCount: 0 },
);
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 class="text-section font-bold text-ink">{{ title }}</h2>
      <span v-if="sub" class="text-small text-ink-3">{{ sub }}</span>
      <RouterLink
        v-if="more"
        :to="more"
        class="ml-auto inline-flex items-center gap-1 text-emphasis font-medium text-ink-2 transition hover:text-ink"
      >
        更多
        <ChevronRight :size="16" class="shrink-0" />
      </RouterLink>
    </div>

    <VodGrid :items="items" :eager-count="eagerCount" />
  </section>
</template>
