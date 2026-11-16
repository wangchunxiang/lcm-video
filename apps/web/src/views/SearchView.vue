<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodCard } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import { useIsMobile } from '../composables/useBreakpoint';
import VodGrid from '../components/VodGrid.vue';
import GridSkeleton from '../components/ui/GridSkeleton.vue';
import FilterBar from '../components/FilterBar.vue';
import PaginationBar from '../components/PaginationBar.vue';

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
  void router.push({ name: 'search', query });
}

function submit(): void {
  const value = keyword.value.trim();
  if (!value) return;
  void router.push({ name: 'search', query: { wd: value } });
}

function loadMore(): void {
  if (loading.value || items.value.length >= total.value) return;
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
  <div class="pt-4">
    <!--
      入口页（还没有关键词）任何宽度都显示；有结果后桌面端收起，
      因为顶栏已经有同一个输入框（见 SiteHeader 的 wd 同步），避免一行重复。
    -->
    <form
      class="mb-4 flex h-[38px] w-full items-center overflow-hidden rounded-md bg-search"
      :class="wd ? 'lg:hidden' : ''"
      @submit.prevent="submit"
    >
      <input
        v-model="keyword"
        type="search"
        maxlength="50"
        placeholder="输入片名，如：流浪地球"
        class="h-full min-w-0 flex-1 border-0 bg-transparent px-4 pr-1 text-input text-ink outline-none placeholder:text-ink-3 sm:text-body"
      />
      <button
        type="submit"
        class="h-full cursor-pointer border-0 bg-transparent pl-2 pr-4 text-small text-ink-2 transition hover:text-ink"
      >
        搜索
      </button>
    </form>

    <template v-if="wd">
      <p v-if="loaded" class="mb-4 text-small text-ink-3">“{{ wd }}” 共 {{ total }} 部</p>

      <FilterBar
        class="mb-4"
        :types="[]"
        :years="years"
        :type="''"
        :year="year"
        :sort="sort"
        @update:type="() => undefined"
        @update:year="(value: string) => setQuery({ year: value })"
        @update:sort="(value: string) => setQuery({ sort: value === 'time' ? undefined : value })"
      />

      <GridSkeleton v-if="loading && !items.length" />
      <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>
      <template v-else-if="loaded">
        <VodGrid v-if="items.length" :items="items" />
        <p v-else class="py-16 text-center text-body text-ink-3">没有找到「{{ wd }}」，换个关键词试试。</p>

        <div v-if="items.length && total > pageSize" class="hidden md:block">
          <PaginationBar
            :page="page"
            :total="total"
            :page-size="pageSize"
            @change="(next: number) => setQuery({ page: String(next) }, true)"
          />
        </div>

        <div v-if="items.length && isMobile && items.length < total" class="mt-4 text-center">
          <button
            type="button"
            class="h-[38px] cursor-pointer rounded-md border border-line bg-surface px-4 text-body text-ink-2 transition hover:border-ink-3/50 hover:text-ink"
            :disabled="loading"
            @click="loadMore"
          >
            {{ loading ? '加载中…' : '加载更多' }}
          </button>
          <p class="mt-2 text-caption text-ink-3">已显示 {{ items.length }} / 共 {{ total }} 部</p>
        </div>
      </template>
    </template>

    <p v-else class="py-16 text-center text-body text-ink-3">输入片名开始搜索。</p>
  </div>
</template>
