<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodCard } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import { useIsMobile } from '../composables/useBreakpoint';
import VodGrid from '../components/VodGrid.vue';
import FilterBar from '../components/FilterBar.vue';
import PaginationBar from '../components/PaginationBar.vue';
import Button from '../components/ui/Button.vue';

const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();

const wd = computed(() => String(route.query.wd ?? '').trim());
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : ''));
const sort = computed(() => (route.query.sort === 'new' ? 'new' : 'time'));
const pageSize = computed(() => site.config.listPageSize || 24);

const keyword = ref(wd.value);
const items = ref<VodCard[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const loaded = ref(false);

const years = computed(() => {
  const now = new Date().getFullYear();
  return Array.from({ length: 30 }, (_, index) => now - index);
});

const hasMore = computed(() => items.value.length < total.value);

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

function loadMore(): void {
  if (loading.value || !hasMore.value) return;
  setQuery({ page: String(page.value + 1) }, true);
}

let requestSeq = 0;

async function load(): Promise<void> {
  if (!wd.value) {
    items.value = [];
    total.value = 0;
    loaded.value = false;
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
    if (seq !== requestSeq) return;
    total.value = result.total;
    if (!isMobile.value || page.value === 1) items.value = result.items;
    else items.value = [...items.value, ...result.items];
    loaded.value = true;
  } catch (e) {
    if (seq !== requestSeq) return;
    items.value = [];
    total.value = 0;
    error.value = (e as Error).message || '搜索失败';
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch(wd, (value) => {
  keyword.value = value;
});
watch([wd, page, year, sort, pageSize], load, { immediate: true });

useSeo(() => ({
  title: wd.value ? `搜索：${wd.value} - ${site.config.siteName}` : `搜索 - ${site.config.siteName}`,
  description: `在 ${site.config.siteName} 搜索影片`,
  noindex: true,
}));
</script>

<template>
  <div>
    <section class="mb-4 mt-6 rounded-[14px] bg-surface p-6 text-center shadow-card sm:p-8">
      <h1 class="mb-4 text-page font-bold text-ink">搜索影片</h1>
      <form class="mx-auto flex w-full max-w-[640px] gap-2" @submit.prevent="submit">
        <input
          v-model="keyword"
          type="search"
          maxlength="50"
          placeholder="输入片名，如：流浪地球"
          aria-label="搜索片名"
          class="h-11 min-w-0 flex-1 rounded-pill border border-line bg-surface-2 px-4 text-body outline-none transition placeholder:text-ink-3 focus:border-primary-line focus:bg-surface focus:shadow-[0_0_0_3px_var(--primary-weak)]"
        />
        <Button variant="primary" class="h-11 px-6">搜索</Button>
      </form>
      <p class="mt-3 text-small text-ink-3">支持片名模糊搜索，最多 50 个字符</p>
    </section>

    <template v-if="wd">
      <div class="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 class="text-page font-bold text-ink">“{{ wd }}” 的搜索结果</h2>
        <span v-if="loaded" class="text-small text-ink-3">共 {{ total }} 部</span>
      </div>

      <FilterBar
        :types="[]"
        :years="years"
        :type="''"
        :year="year"
        :sort="sort"
        @update:type="() => undefined"
        @update:year="(value: string) => setQuery({ year: value })"
        @update:sort="(value: string) => setQuery({ sort: value === 'time' ? undefined : value })"
      />

      <p v-if="loading && !items.length" class="py-16 text-center text-body text-ink-3">搜索中…</p>
      <p v-else-if="error" class="my-6 rounded-[10px] border border-[#f3d1d1] bg-[#fdf3f3] px-4 py-5 text-center text-body text-danger">
        {{ error }}
      </p>
      <template v-else-if="loaded">
        <VodGrid v-if="items.length" :items="items" show-category />
        <p v-else class="py-16 text-center text-body text-ink-3">没有找到相关影片，换个关键词试试</p>

        <div v-if="items.length && total > pageSize" class="hidden md:block">
          <PaginationBar
            :page="page"
            :total="total"
            :page-size="pageSize"
            @change="(next: number) => setQuery({ page: String(next) }, true)"
          />
        </div>

        <div v-if="items.length" class="mt-4 md:hidden">
          <Button v-if="hasMore" class="w-full" :disabled="loading" @click="loadMore">
            {{ loading ? '加载中…' : '加载更多' }}
          </Button>
          <p class="mt-2 text-center text-caption text-ink-3">已显示 {{ items.length }} / 共 {{ total }} 部</p>
        </div>
      </template>
    </template>

    <p v-else class="py-16 text-center text-body text-ink-3">输入片名开始搜索</p>
  </div>
</template>
