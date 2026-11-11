<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { portal, type VodCard } from '../api/portal.ts';

const keyword = ref('');
const items = ref<VodCard[]>([]);
const total = ref(0);
const error = ref('');

async function submit(): Promise<void> {
  const wd = keyword.value.trim();
  if (wd === '') return;
  error.value = '';
  try {
    const result = await portal.search({ wd, take: 24 });
    items.value = result.items;
    total.value = result.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '搜索失败';
  }
}
</script>

<template>
  <section>
    <h1 class="page-title">搜索</h1>
    <form @submit.prevent="submit">
      <input v-model="keyword" type="search" placeholder="输入片名" />
      <button type="submit">搜索</button>
    </form>
    <p v-if="error" class="hint">{{ error }}</p>
    <p v-else-if="total > 0" class="hint">共 {{ total }} 条结果</p>

    <ul class="card-list">
      <li v-for="vod in items" :key="vod.id" class="card">
        <RouterLink :to="`/detail/${vod.id}`">{{ vod.name }}</RouterLink>
        <p class="hint">{{ vod.year }} · {{ vod.categoryName }}</p>
      </li>
    </ul>
  </section>
</template>
