<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodListPage } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import FilterBar from '../components/FilterBar.vue';
import PaginationBar from '../components/PaginationBar.vue';
import Skeleton from '../components/ui/Skeleton.vue';

/**
 * 列表页（D1 版式）：标题 / 筛选条 / 海报网格 / 分页，单列通宽，没有侧栏。
 *
 * 一级分类的切换交给筛选条最上面的「分类」行（与顶栏导航同一个去向），
 * 当前分类的子类型挂在「类型」行；两端都用分页器，每页只渲染当前页。
 */
const route = useRoute();
const router = useRouter();

const alias = computed(() => String(route.params.alias || ''));
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const type = computed(() => (typeof route.query.type === 'string' ? route.query.type : ''));
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : ''));
const sort = computed(() => (route.query.sort === 'new' ? 'new' : 'time'));
const pageSize = computed(() => site.config.listPageSize || 24);

const data = ref<VodListPage | null>(null);
const loading = ref(true);
const error = ref('');

const categoryName = computed(() => data.value?.category.name ?? '');
const shown = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);

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
  void router.push({ name: 'list', params: { alias: alias.value }, query });
}

function goPage(next: number): void {
  setQuery({ page: String(next) }, true);
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
  } catch (e) {
    if (seq !== requestSeq) return;
    data.value = null;
    error.value = (e as Error).message || '列表加载失败';
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch([alias, page, type, year, sort, pageSize], load, { immediate: true });

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

/**
 * 当前页超出实际页数时纠正到最后一页。
 *
 * 两种常见来源：手工改 URL 的 `?page=99999`；以及站里一直在采集，改天总量变少后旧的
 * 「尾页」地址就失效了。落到空页时列表显示「暂无影片」、分页条又按「有内容才渲染」的规则
 * 消失，等于没路可退。等 `data` 到位再判断，避免首屏 total=0 时把 page 误拉回 1。
 */
watch(
  [page, pageCount, data],
  () => {
    if (!data.value) return;
    if (page.value > pageCount.value) goPage(pageCount.value);
  },
  { flush: 'post' },
);

useSeo(() => ({
  title: `${categoryName.value}在线观看 - ${site.config.siteName}`,
  description: `${categoryName.value}频道：${site.config.siteSubtitle}`,
}));
</script>

<template>
  <div class="flex flex-col gap-4 pt-4">

    <FilterBar
      :types="data?.types ?? []"
      :years="data?.years ?? []"
      :type="type"
      :year="year"
      :sort="sort"
      @update:type="(value: string) => setQuery({ type: value })"
      @update:year="(value: string) => setQuery({ year: value })"
      @update:sort="(value: string) => setQuery({ sort: value === 'time' ? undefined : value })"
    />

    <div v-if="loading && !shown.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      <div v-for="index in 12" :key="index" class="flex flex-col gap-2">
        <Skeleton class="aspect-[2/3] w-full rounded-md" />
        <Skeleton class="h-4 w-3/4 rounded-md" />
      </div>
    </div>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <template v-else>
      <VodGrid v-if="shown.length" :items="shown" />
      <p v-else class="py-16 text-center text-body text-ink-3">该分类下暂无影片。</p>

      <PaginationBar
        v-if="shown.length && total > pageSize"
        :page="page"
        :total="total"
        :page-size="pageSize"
        @change="goPage"
      />
    </template>
  </div>
</template>
