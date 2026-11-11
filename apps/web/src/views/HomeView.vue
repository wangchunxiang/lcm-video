<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { portal, type HomeResult } from '../api/portal.ts';

const data = ref<HomeResult | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    data.value = await portal.home();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
});
</script>

<template>
  <section>
    <h1 class="page-title">首页</h1>
    <p class="hint">占位页：只验证 `/api/site/home` 连通，样式与交互待补。</p>
    <p v-if="error" class="hint">{{ error }}</p>

    <template v-if="data">
      <nav class="nav">
        <RouterLink v-for="item in data.categories" :key="item.id" :to="`/list/${item.alias}`">
          {{ item.name }}
        </RouterLink>
      </nav>

      <section v-for="row in data.rows" :key="row.title">
        <h2 class="page-title">{{ row.title }}（{{ row.items.length }}）</h2>
        <ul class="card-list">
          <li v-for="vod in row.items" :key="vod.id" class="card">
            <RouterLink :to="`/detail/${vod.id}`">{{ vod.name }}</RouterLink>
            <p class="hint">{{ vod.year }} · {{ vod.remarks }}</p>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
