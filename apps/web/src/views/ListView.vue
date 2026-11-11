<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { portal, type VodListPage } from '../api/portal.ts';

const route = useRoute();
const alias = computed(() => String(route.params.alias ?? 'all'));
const page = ref<VodListPage | null>(null);
const error = ref('');

async function load(): Promise<void> {
  error.value = '';
  try {
    page.value = await portal.list(alias.value, { take: 24 });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
}

watch(alias, load, { immediate: true });
</script>

<template>
  <section>
    <h1 class="page-title">{{ page?.category?.name ?? '全部影片' }}</h1>
    <p class="hint">
      占位页：分类 {{ alias }}，共 {{ page?.total ?? 0 }} 部；筛选与分页待补。
    </p>
    <p v-if="error" class="hint">{{ error }}</p>

    <ul class="card-list">
      <li v-for="vod in page?.items ?? []" :key="vod.id" class="card">
        <RouterLink :to="`/detail/${vod.id}`">{{ vod.name }}</RouterLink>
        <p class="hint">{{ vod.year }} · {{ vod.categoryName }}</p>
      </li>
    </ul>
  </section>
</template>
