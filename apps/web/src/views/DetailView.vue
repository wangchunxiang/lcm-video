<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { portal, type VodDetail } from '../api/portal.ts';

const route = useRoute();
const detail = ref<VodDetail | null>(null);
const error = ref('');

watch(
  () => route.params.id,
  async (id) => {
    error.value = '';
    detail.value = null;
    try {
      detail.value = await portal.detail(String(id));
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败';
    }
  },
  { immediate: true },
);
</script>

<template>
  <section>
    <p v-if="error" class="hint">{{ error }}</p>
    <template v-if="detail">
      <h1 class="page-title">{{ detail.vod.name }}</h1>
      <p class="hint">
        {{ detail.vod.year }} · {{ detail.vod.area }} · {{ detail.vod.remarks }}
      </p>
      <p>线路：{{ detail.lines.map((line) => line.name).join(' / ') || '无' }}</p>
      <p>
        <RouterLink :to="`/play/${detail.vod.id}`">去播放</RouterLink>
      </p>
      <p class="hint">占位页：简介、推荐位与样式待补。</p>
    </template>
  </section>
</template>
