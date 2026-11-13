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
  <RouterLink
    :to="`/detail/${vod.id}`"
    class="group flex min-w-0 flex-col gap-2 rounded-[10px] bg-surface p-1 shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-card-hover sm:p-2.5"
  >
    <div class="relative aspect-[2/3] overflow-hidden rounded-[6px] bg-surface-2">
      <img
        :src="cover"
        :alt="vod.name"
        loading="lazy"
        class="h-full w-full object-cover"
        @error="broken = true"
      />
      <span
        v-if="badge"
        class="absolute bottom-2 right-2 max-w-[calc(100%-16px)] truncate rounded bg-black/66 px-2 text-caption leading-5 text-white"
      >
        {{ badge }}
      </span>
    </div>
    <div class="truncate text-body font-semibold leading-[1.45] group-hover:text-primary">
      {{ vod.name }}
    </div>
    <div class="min-h-[18px] truncate text-caption text-ink-3">{{ meta }}</div>
  </RouterLink>
</template>
