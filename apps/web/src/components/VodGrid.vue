<script setup lang="ts">
import type { VodCard as VodCardData } from '../api/portal';
import VodCard from './VodCard.vue';

withDefaults(
  defineProps<{
    items: VodCardData[];
    showCategory?: boolean;
  }>(),
  { showCategory: false },
);
</script>

<template>
  <div class="vod-grid">
    <VodCard v-for="item in items" :key="item.id" :vod="item" :show-category="showCategory" />
  </div>
</template>
