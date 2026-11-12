<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodListPage } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import PaginationBar from '../components/PaginationBar.vue';

const route = useRoute();
const router = useRouter();

const alias = computed(() => String(route.params.alias || 'all'));
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const type = computed(() => (typeof route.query.type === 'string' ? route.query.type : ''));
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : ''));
const sort = computed(() => (route.query.sort === 'new' ? 'new' : 'time'));
const pageSize = computed(() => site.config.listPageSize || 24);

const data = ref<VodListPage | null>(null);
const loading = ref(true);
const error = ref('');

const categoryName = computed(() => data.value?.category?.name ?? '全部影片');

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
  router.push({ name: 'list', params: { alias: alias.value }, query });
}

function goPage(next: number): void {
  setQuery({ page: String(next) }, true);
}

async function load(): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = '';
  try {
    const result = await portal.list(alias.value, {
      type: type.value || undefined,
      year: year.value || undefined,
      sort: sort.value,
      take: pageSize.value,
      skip: (page.value - 1) * pageSize.value,
    });
    if (seq === requestSeq) data.value = result;
  } catch (e) {
    if (seq === requestSeq) {
      data.value = null;
      error.value = (e as Error).message || '列表加载失败';
    }
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

let requestSeq = 0;

watch([alias, page, type, year, sort, pageSize], load, { immediate: true });

useSeo(() => ({
  title: `${categoryName.value}在线观看 - ${site.config.siteName}`,
  description: `${categoryName.value}频道：${site.config.siteSubtitle}`,
}));
</script>

<template>
  <div>
    <nav class="crumb">
      <RouterLink to="/">首页</RouterLink>
      <span>/</span>
      <span>{{ categoryName }}</span>
    </nav>

    <div class="page-head">
      <h1 class="page-title">{{ categoryName }}</h1>
      <span v-if="data" class="page-sub">共 {{ data.total }} 部</span>
    </div>

    <div v-if="data && (data.types.length || data.years.length)" class="filter-bar">
      <div v-if="data.types.length" class="filter-row">
        <span class="filter-label">类型</span>
        <div class="chip-list">
          <button
            class="chip"
            :class="{ 'is-on': !type }"
            type="button"
            @click="setQuery({ type: undefined })"
          >
            全部
          </button>
          <button
            v-for="item in data.types"
            :key="item.id"
            class="chip"
            :class="{ 'is-on': type === item.alias }"
            type="button"
            @click="setQuery({ type: item.alias })"
          >
            {{ item.name }}
          </button>
        </div>
      </div>

      <div v-if="data.years.length" class="filter-row">
        <span class="filter-label">年份</span>
        <div class="chip-list">
          <button
            class="chip"
            :class="{ 'is-on': !year }"
            type="button"
            @click="setQuery({ year: undefined })"
          >
            全部
          </button>
          <button
            v-for="item in data.years"
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
          <button
            class="chip"
            :class="{ 'is-on': sort === 'time' }"
            type="button"
            @click="setQuery({ sort: undefined })"
          >
            最近更新
          </button>
          <button
            class="chip"
            :class="{ 'is-on': sort === 'new' }"
            type="button"
            @click="setQuery({ sort: 'new' })"
          >
            最新入库
          </button>
        </div>
      </div>
    </div>

    <p v-if="loading" class="loading-tip">加载中…</p>
    <p v-else-if="error" class="error-box">{{ error }}</p>
    <template v-else-if="data">
      <VodGrid v-if="data.items.length" :items="data.items" show-category />
      <p v-else class="empty-tip">该分类下暂无影片</p>
      <PaginationBar
        v-if="data.items.length"
        :page="page"
        :total="data.total"
        :page-size="pageSize"
        @change="goPage"
      />
    </template>
  </div>
</template>
