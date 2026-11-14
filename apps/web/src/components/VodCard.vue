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
      class="relative aspect-[2/3] overflow-hidden rounded-md bg-[linear-gradient(135deg,#1f2733,#171d26)] transition-shadow duration-200 group-hover:ring-1 group-hover:ring-primary-line"
    >
      <img
        :src="cover"
        :alt="vod.name"
        loading="lazy"
        class="h-full w-full object-fill transition-transform duration-500 group-hover:scale-[1.14]"
        :class="loaded ? 'opacity-100' : 'opacity-0'"
        @load="loaded = true"
        @error="onError"
      />
      <span
        v-if="badge"
        class="absolute right-1.5 top-1.5 z-10 max-w-[calc(100%-12px)] truncate rounded-sm border border-white/10 bg-[rgba(8,9,12,0.72)] px-2 py-1 text-caption text-ink backdrop-blur-sm"
      >
        {{ badge }}
      </span>
    </div>
    <!-- 片名一行，不再放年份 / 地区 -->
    <span class="truncate text-vod leading-tight transition-colors">{{ vod.name }}</span>
  </RouterLink>
</template>
