<script setup lang="ts">
import type { VodCard as VodCardData } from '../api/portal';
import VodCard from './VodCard.vue';

withDefaults(defineProps<{ items: VodCardData[]; showCategory?: boolean }>(), { showCategory: false });
</script>

<template>
  <div class="vod-grid grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-4 md:grid-cols-4 lg:grid-cols-6">
    <VodCard v-for="item in items" :key="item.id" :vod="item" :show-category="showCategory" />
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
