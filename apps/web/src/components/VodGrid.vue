<script setup lang="ts">
import type { VodCard as VodCardData } from '../api/portal';
import VodCard from './VodCard.vue';

withDefaults(
  defineProps<{
    items: VodCardData[];
    /**
     * 前 N 张按 eager 加载（首屏可见的那部分）：
     * 原生 lazy 要等图片快进视口才开始下载，小屏首屏只有 2 列 2~3 行，
     * 不提前拉的话首屏海报会明显晚一拍出来。默认全 lazy。
     */
    eagerCount?: number;
  }>(),
  { eagerCount: 0 },
);
</script>

<template>
  <div class="vod-grid grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    <VodCard
      v-for="(item, index) in items"
      :key="item.id"
      :vod="item"
      :eager="index < eagerCount"
    />
  </div>
</template>

<style scoped>
/*
 * 大屏 8 列单独写成媒体查询：Tailwind 的自定义 1400px 断点会被排在 lg 之前，
 * 导致 1440 宽度下仍然命中 lg:grid-cols-6（实测 computed 6 列）。
 */
@media (min-width: 1400px) {
  .vod-grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}
</style>
