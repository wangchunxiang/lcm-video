<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodCard as VodCardData, type VodListPage } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import { useIsMobile } from '../composables/useBreakpoint';
import VodGrid from '../components/VodGrid.vue';
import FilterBar from '../components/FilterBar.vue';
import PaginationBar from '../components/PaginationBar.vue';
import Button from '../components/ui/Button.vue';
import Skeleton from '../components/ui/Skeleton.vue';

const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();

const alias = computed(() => String(route.params.alias || 'all'));
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const type = computed(() => (typeof route.query.type === 'string' ? route.query.type : ''));
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : ''));
const sort = computed(() => (route.query.sort === 'new' ? 'new' : 'time'));
const pageSize = computed(() => site.config.listPageSize || 24);

const data = ref<VodListPage | null>(null);
const items = ref<VodCardData[]>([]);
const loading = ref(true);
const error = ref('');

const categoryName = computed(() => data.value?.category?.name ?? '全部影片');
const shown = computed(() => (isMobile.value ? items.value : (data.value?.items ?? [])));
const total = computed(() => data.value?.total ?? 0);
const hasMore = computed(() => shown.value.length < total.value);

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

function loadMore(): void {
  if (loading.value || !hasMore.value) return;
  setQuery({ page: String(page.value + 1) }, true);
}

let requestSeq = 0;

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
    if (seq !== requestSeq) return;
    data.value = result;
    // 手机端是「加载更多」：第一页重置，后续页追加；桌面端始终只显示当前页
    if (!isMobile.value || page.value === 1 || items.value.length === 0) items.value = result.items;
    else items.value = [...items.value, ...result.items];
  } catch (e) {
    if (seq !== requestSeq) return;
    data.value = null;
    items.value = [];
    error.value = (e as Error).message || '列表加载失败';
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch([alias, page, type, year, sort, pageSize], load, { immediate: true });

useSeo(() => ({
  title: `${categoryName.value}在线观看 - ${site.config.siteName}`,
  description: `${categoryName.value}频道：${site.config.siteSubtitle}`,
}));
</script>

<template>
  <div>
    <nav class="mb-4 mt-5 flex flex-wrap items-center gap-2 text-small text-ink-3">
      <RouterLink to="/" class="transition hover:text-primary">首页</RouterLink>
      <span>/</span>
      <span class="text-ink-2">{{ categoryName }}</span>
    </nav>

    <div class="mb-4 flex flex-wrap items-baseline gap-3">
      <h1 class="text-page font-bold text-ink">{{ categoryName }}</h1>
      <span v-if="data" class="text-small text-ink-3">共 {{ total }} 部</span>
    </div>

    <FilterBar
      v-if="data"
      :types="data.types"
      :years="data.years"
      :type="type"
      :year="year"
      :sort="sort"
      @update:type="(value: string) => setQuery({ type: value })"
      @update:year="(value: string) => setQuery({ year: value })"
      @update:sort="(value: string) => setQuery({ sort: value === 'time' ? undefined : value })"
    />

    <div
      v-if="loading && !shown.length"
      class="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-4 md:grid-cols-4 xl:grid-cols-6 min-[1500px]:grid-cols-8"
    >
      <div v-for="index in 12" :key="index" class="rounded-[10px] bg-surface p-1 shadow-card sm:p-2.5">
        <Skeleton class="aspect-[2/3] w-full" />
        <Skeleton class="mt-2 h-3.5 w-4/5" />
        <Skeleton class="mt-1.5 h-3 w-1/2" />
      </div>
    </div>

    <p v-else-if="error" class="my-6 rounded-[10px] border border-[#f3d1d1] bg-[#fdf3f3] px-4 py-5 text-center text-body text-danger">
      {{ error }}
    </p>

    <template v-else>
      <VodGrid v-if="shown.length" :items="shown" show-category />
      <p v-else class="py-12 text-center text-body text-ink-3">该分类下暂无影片</p>

      <!-- 桌面：分页器 -->
      <div v-if="shown.length && total > pageSize" class="hidden md:block">
        <PaginationBar :page="page" :total="total" :page-size="pageSize" @change="goPage" />
      </div>

      <!-- 手机：加载更多 -->
      <div v-if="shown.length" class="mt-4 md:hidden">
        <Button v-if="hasMore" class="w-full" :disabled="loading" @click="loadMore">
          {{ loading ? '加载中…' : '加载更多' }}
        </Button>
        <p class="mt-2 text-center text-caption text-ink-3">已显示 {{ shown.length }} / 共 {{ total }} 部</p>
      </div>
    </template>
  </div>
</template>
