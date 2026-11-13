<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VodCard as VodCardData } from '../api/portal';

const props = defineProps<{ vod: VodCardData }>();

const PLACEHOLDER = '/img/poster-placeholder.svg';
const broken = ref(false);
const loaded = ref(false);

const cover = computed(() => (broken.value || !props.vod.cover ? PLACEHOLDER : props.vod.cover));
const badge = computed(
  () => props.vod.remarks || (props.vod.episodeCount > 0 ? `全${props.vod.episodeCount}集` : ''),
);

function onError(): void {
  broken.value = true;
  loaded.value = true;
}
</script>

<template>
  <RouterLink :to="`/detail/${vod.id}`" :title="vod.name" class="group flex min-w-0 flex-col gap-2">
    <div
      class="relative aspect-[210/280] overflow-hidden rounded-md bg-[linear-gradient(135deg,#1f2733,#171d26)]"
    >
      <img
        :src="cover"
        :alt="vod.name"
        loading="lazy"
        class="h-full w-full object-fill transition-transform duration-300 group-hover:scale-105"
        :class="loaded ? 'opacity-100' : 'opacity-0'"
        @load="loaded = true"
        @error="onError"
      />
      <span
        v-if="badge"
        class="absolute inset-x-0 bottom-0 truncate bg-[linear-gradient(to_top,rgba(0,0,0,0.72),transparent)] px-2 py-1 text-center text-caption text-white"
      >
        {{ badge }}
      </span>
    </div>
    <div class="truncate text-center text-vod leading-[1.5] transition-colors group-hover:text-primary">
      {{ vod.name }}
    </div>
  </RouterLink>
</template>
