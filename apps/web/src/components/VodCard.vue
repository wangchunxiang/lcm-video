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
const badge = computed(
  () => props.vod.remarks || (props.vod.episodeCount > 0 ? `全${props.vod.episodeCount}集` : ''),
);
const meta = computed(() =>
  [props.vod.year > 0 ? String(props.vod.year) : '', props.vod.area, props.showCategory ? props.vod.categoryName : '']
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <RouterLink :to="`/detail/${vod.id}`" class="group block min-w-0">
    <div class="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-2">
      <img
        :src="cover"
        :alt="vod.name"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        @error="broken = true"
      />
      <span
        v-if="badge"
        class="absolute right-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-caption leading-4 text-white"
      >
        {{ badge }}
      </span>
    </div>
    <div class="mt-1.5 truncate text-small font-medium text-ink group-hover:text-primary sm:text-body">
      {{ vod.name }}
    </div>
    <div class="mt-0.5 truncate text-caption text-ink-3">{{ meta }}</div>
  </RouterLink>
</template>
