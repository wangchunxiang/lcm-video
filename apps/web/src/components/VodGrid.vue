<script setup lang="ts">
import type { VodCard as VodCardData } from '../api/portal';
import Grid from './layout/Grid.vue';
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
  <Grid>
    <VodCard v-for="item in items" :key="item.id" :vod="item" :show-category="showCategory" />
  </Grid>
</template>
