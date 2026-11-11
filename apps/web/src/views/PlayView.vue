<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { portal, type VodPlay } from '../api/portal.ts';

const route = useRoute();
const play = ref<VodPlay | null>(null);
const error = ref('');

watch(
  () => [route.params.id, route.query.line, route.query.ep],
  async () => {
    error.value = '';
    try {
      play.value = await portal.play(String(route.params.id), {
        line: Number(route.query.line ?? 0),
        ep: Number(route.query.ep ?? 1),
      });
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
    <template v-if="play">
      <h1 class="page-title">{{ play.vod.name }}</h1>
      <p class="hint">
        线路 {{ play.line.name }} · 第 {{ play.current }} / {{ play.episodes.length }} 集
      </p>
      <p class="hint">占位页：播放器（hls.js / 直链）待接。</p>
    </template>
  </section>
</template>
