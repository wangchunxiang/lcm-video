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
 * 加载中只垫中性渐变（见 <style> 里的 .poster），真实封面加载完再淡入；
 * 「暂无封面」占位图只在无封面 / 坏图时才出现，避免下载过程中先把「暂无」摆出来误导用户。
 * 不用「加载前整块透明」的写法：iOS Safari 的原生懒加载有已知缺陷（WebKit 237703 / 240083），
 * 图片偶尔永远不触发 load，那样卡片会一直是空块；有渐变底时最差也只是一块深色海报位。
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
      <!-- 加载中的呼吸层：真实封面淡入后撤掉 -->
      <div
        v-if="!loaded && !broken && cover"
        class="absolute inset-0 animate-pulse bg-surface-2"
        aria-hidden="true"
      />
      <!-- 无封面 / 坏图时才显示「暂无封面」 -->
      <div v-if="!cover || broken" class="poster-fallback absolute inset-0" aria-hidden="true" />
      <img
        v-if="!broken && cover"
        ref="posterRef"
        :src="cover"
        :alt="vod.name"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : 'auto'"
        decoding="async"
        class="relative h-full w-full object-fill transition-[scale,opacity] duration-500 group-hover:scale-[1.14]"
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
/* 加载中的中性底：只有深色渐变，不出现「暂无封面」字样 */
.poster {
  background-image: linear-gradient(135deg, #1f2733, #171d26);
}

/* 无封面 / 坏图：铺占位图（画布 2:3、拉伸铺满） */
.poster-fallback {
  background-image: url('/img/poster-placeholder.svg');
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
</style>
