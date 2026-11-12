<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodCard } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import PaginationBar from '../components/PaginationBar.vue';

const route = useRoute();
const router = useRouter();

const wd = computed(() => String(route.query.wd ?? '').trim());
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : ''));
const sort = computed(() => (route.query.sort === 'new' ? 'new' : 'time'));
const pageSize = computed(() => site.config.listPageSize || 24);

const keyword = ref(wd.value);
const data = ref<{ items: VodCard[]; total: number } | null>(null);
const loading = ref(false);
const error = ref('');

const years = computed(() => {
  const now = new Date().getFullYear();
  return Array.from({ length: 30 }, (_, index) => now - index);
});

function setQuery(patch: Record<string, string | undefined>, keepPage = false): void {
  const query: Record<string, string> = {};
  Object.entries(route.query).forEach(([key, value]) => {
    if (typeof value === 'string' && value) query[key] = value;
  });
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === '') delete query[key];
    else query[key] = value;
  });
  if (!keepPage) delete query.page;
  router.push({ name: 'search', query });
}

function submit(): void {
  const value = keyword.value.trim();
  if (!value) return;
  router.push({ name: 'search', query: { wd: value } });
}

let requestSeq = 0;

async function load(): Promise<void> {
  if (!wd.value) {
    data.value = null;
    loading.value = false;
    return;
  }
  const seq = ++requestSeq;
  loading.value = true;
  error.value = '';
  try {
    const result = await portal.search({
      wd: wd.value,
      year: year.value || undefined,
      sort: sort.value,
      take: pageSize.value,
      skip: (page.value - 1) * pageSize.value,
    });
    if (seq === requestSeq) data.value = result;
  } catch (e) {
    if (seq === requestSeq) {
      data.value = null;
      error.value = (e as Error).message || '搜索失败';
    }
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch(wd, (value) => {
  keyword.value = value;
});
watch([wd, page, year, sort, pageSize], load, { immediate: true });

useSeo(() => ({
  title: wd.value
    ? `搜索：${wd.value} - ${site.config.siteName}`
    : `搜索 - ${site.config.siteName}`,
  description: `在 ${site.config.siteName} 搜索影片`,
  noindex: true,
}));
</script>

<template>
  <div>
    <section class="search-hero">
      <h1>搜索影片</h1>
      <form class="search-form" @submit.prevent="submit">
        <input v-model="keyword" type="search" maxlength="50" placeholder="输入片名，如：流浪地球" aria-label="搜索片名" />
        <button class="btn btn-primary" type="submit">搜索</button>
      </form>
      <p class="search-hint">支持片名模糊搜索，最多 50 个字符</p>
    </section>

    <template v-if="wd">
      <div class="page-head">
        <h2 class="page-title">“{{ wd }}” 的搜索结果</h2>
        <span v-if="data" class="page-sub">共 {{ data.total }} 部</span>
      </div>

      <div class="filter-bar">
        <div class="filter-row">
          <span class="filter-label">年份</span>
          <div class="chip-list">
            <button class="chip" :class="{ 'is-on': !year }" type="button" @click="setQuery({ year: undefined })">
              全部
            </button>
            <button
              v-for="item in years"
              :key="item"
              class="chip"
              :class="{ 'is-on': year === String(item) }"
              type="button"
              @click="setQuery({ year: String(item) })"
            >
              {{ item }}
            </button>
          </div>
        </div>
        <div class="filter-row">
          <span class="filter-label">排序</span>
          <div class="chip-list">
            <button class="chip" :class="{ 'is-on': sort === 'time' }" type="button" @click="setQuery({ sort: undefined })">
              最近更新
            </button>
            <button class="chip" :class="{ 'is-on': sort === 'new' }" type="button" @click="setQuery({ sort: 'new' })">
              最新入库
            </button>
          </div>
        </div>
      </div>

      <p v-if="loading" class="loading-tip">搜索中…</p>
      <p v-else-if="error" class="error-box">{{ error }}</p>
      <template v-else-if="data">
        <VodGrid v-if="data.items.length" :items="data.items" show-category />
        <p v-else class="empty-tip">没有找到相关影片，换个关键词试试</p>
        <PaginationBar
          v-if="data.items.length"
          :page="page"
          :total="data.total"
          :page-size="pageSize"
          @change="(next) => setQuery({ page: String(next) }, true)"
        />
      </template>
    </template>

    <p v-else class="empty-tip">输入片名开始搜索</p>
  </div>
</template>
