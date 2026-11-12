<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VodCard as VodCardData } from '../api/portal';

const props = withDefaults(
  defineProps<{
    vod: VodCardData;
    showCategory?: boolean;
  }>(),
  { showCategory: false },
);

const PLACEHOLDER = '/img/poster-placeholder.svg';
const broken = ref(false);

const cover = computed(() => (broken.value || !props.vod.cover ? PLACEHOLDER : props.vod.cover));
const badge = computed(() => props.vod.remarks || (props.vod.episodeCount > 0 ? `全${props.vod.episodeCount}集` : ''));
const meta = computed(() =>
  [props.vod.year > 0 ? String(props.vod.year) : '', props.vod.area, props.showCategory ? props.vod.categoryName : '']
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <RouterLink class="vod-card" :to="`/detail/${vod.id}`">
    <div class="vod-poster">
      <img :src="cover" :alt="vod.name" loading="lazy" @error="broken = true" />
      <span v-if="badge" class="vod-badge">{{ badge }}</span>
    </div>
    <div class="vod-name" :title="vod.name">{{ vod.name }}</div>
    <div class="vod-meta">{{ meta }}</div>
  </RouterLink>
</template>
