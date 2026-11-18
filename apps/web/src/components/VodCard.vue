<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { VodCard as VodCardData } from '../api/portal';

const props = defineProps<{
  vod: VodCardData;
  /**
   * 首屏可见的那几张：`loading="eager"` + `fetchpriority="high"`，其余走原生 lazy。
   * 见 VodGrid 的 eagerCount。
   */
  eager?: boolean;
}>();

/*
 * 占位图始终作为卡片底图（见 <style> 里的 .poster），真实封面加载完再淡入。
 * 不用「加载前整块透明」的写法：iOS Safari 的原生懒加载有已知缺陷（WebKit 237703 / 240083），
 * 图片偶尔永远不触发 load，那样卡片会一直是空块；有底图时最差也只是显示「暂无封面」。
 */
const broken = ref(false);
const loaded = ref(false);
const posterRef = ref<HTMLImageElement | null>(null);

const cover = computed(() => props.vod.cover);
const badge = computed(
  () => props.vod.remarks || (props.vod.episodeCount > 0 ? `全${props.vod.episodeCount}集` : ''),
);

function onError(): void {
  // 坏图直接撤掉 <img>，让底图露出来；比把 src 换成占位图少一次请求/解码
  broken.value = true;
}

/**
 * 兜底：缓存命中或浏览器漏发 load 时，`complete` 已经是 true，直接置为可见。
 * 懒加载的图此时还没开始下载，complete 为 false，不影响原有行为。
 */
onMounted(() => {
  const img = posterRef.value;
  if (img && img.complete && img.naturalWidth > 0) loaded.value = true;
});
</script>

<template>
  <RouterLink :to="`/detail/${vod.id}`" :title="vod.name" class="group flex min-w-0 flex-col gap-2">
    <div
      class="poster relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 transition-shadow duration-200 group-hover:ring-1 group-hover:ring-primary-line"
    >
      <img
        v-if="!broken && cover"
        ref="posterRef"
        :src="cover"
        :alt="vod.name"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : 'auto'"
        decoding="async"
        class="relative h-full w-full object-fill transition-[transform,opacity] duration-500 group-hover:scale-[1.14]"
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

<style scoped>
/* 底图：海报位永远有内容，真实封面淡入时不会有「先空一块」的观感 */
.poster {
  background-image: url('/img/poster-placeholder.svg');
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
</style>
