<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isAbortError, portal, type VodCard } from '../api/portal';
import { site } from '../site';
import { useKeywordDraft } from '../composables/useKeywordDraft';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import GridSkeleton from '../components/ui/GridSkeleton.vue';
import Skeleton from '../components/ui/Skeleton.vue';
import FilterBar from '../components/FilterBar.vue';
import PaginationBar from '../components/PaginationBar.vue';

const route = useRoute();
const router = useRouter();

const wd = computed(() => String(route.query.wd ?? '').trim());
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : ''));
const sort = computed(() => (route.query.sort === 'new' ? 'new' : 'time'));
const pageSize = computed(() => site.config.listPageSize || 24);

const { keyword, submit } = useKeywordDraft();
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

/** 在飞请求：搜索是最容易连点的入口，上一个没回来就断掉 */
let controller: AbortController | null = null;

async function load(): Promise<void> {
  controller?.abort();
  if (!wd.value) {
    items.value = [];
    total.value = 0;
    loaded.value = false;
    loading.value = false;
    return;
  }
  // 站点配置还没到位也要先进加载态：否则这里是空白，配置到了骨架才出现，等于又跳一次
  loading.value = true;
  error.value = '';
  // 等站点配置到位再查：否则先用 24 条查一次，配置到了又查一次
  if (!site.ready) return;
  const next = new AbortController();
  controller = next;
  try {
    const result = await portal.search(
      {
        wd: wd.value,
        year: year.value || undefined,
        sort: sort.value,
        take: pageSize.value,
        skip: (page.value - 1) * pageSize.value,
      },
      { signal: next.signal },
    );
    total.value = result.total;
    items.value = result.items;
    loaded.value = true;
  } catch (e) {
    if (isAbortError(e)) return;
    items.value = [];
    total.value = 0;
    error.value = (e as Error).message || '搜索失败';
  } finally {
    if (controller === next) loading.value = false;
  }
}

onBeforeUnmount(() => controller?.abort());

watch([wd, page, year, sort, pageSize, () => site.ready], load, { immediate: true });

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

/** 同列表页：page 超出实际页数时纠正到最后一页，否则空结果连分页条都没有 */
watch(
  [page, pageCount, loaded],
  () => {
    if (!loaded.value || !total.value) return;
    if (page.value > pageCount.value) setQuery({ page: String(pageCount.value) }, true);
  },
  { flush: 'post' },
);

useSeo(() => ({
  title: wd.value ? `搜索：${wd.value} - ${site.config.siteName}` : `搜索 - ${site.config.siteName}`,
  description: `在 ${site.config.siteName} 搜索片名`,
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
        placeholder="搜索片名"
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
      <!-- 加载中先占住「共 N 部」这一行的高度，结果回来时网格不会被顶下去 -->
      <Skeleton v-else-if="loading" class="mb-4 h-[22px] w-40" />

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

      <GridSkeleton v-if="loading && !items.length" :count="pageSize" />
      <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>
      <template v-else-if="loaded">
        <VodGrid v-if="items.length" :items="items" :eager-count="8" />
        <p v-else class="py-16 text-center text-body text-ink-3">没有找到「{{ wd }}」，换个片名试试。</p>

        <PaginationBar
          v-if="items.length && total > pageSize"
          :page="page"
          :total="total"
          :page-size="pageSize"
          @change="(next: number) => setQuery({ page: String(next) }, true)"
        />
      </template>
    </template>

    <p v-else class="py-16 text-center text-body text-ink-3">输入片名，开始搜索。</p>
  </div>
</template>
