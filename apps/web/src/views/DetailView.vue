<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type EpisodeItem, type VodDetail } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import Skeleton from '../components/ui/Skeleton.vue';
import { buttonClass } from '../components/ui/button';

const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id || ''));
const data = ref<VodDetail | null>(null);
const loading = ref(true);
const error = ref('');
const episodes = ref<EpisodeItem[]>([]);
const epLoading = ref(false);

const vod = computed(() => data.value?.vod ?? null);
const lines = computed(() => data.value?.lines ?? []);

const queryLine = computed(() => (typeof route.query.line === 'string' ? route.query.line : ''));

/** URL 里的 line 是线路 id；缺失或失效时回落到第一条线路。 */
const selectedLine = computed(() => {
  if (!lines.value.length) return null;
  return lines.value.find((line) => line.id === queryLine.value) ?? lines.value[0];
});

const currentEp = computed(() => {
  const value = Number(route.query.ep);
  return Number.isFinite(value) && value > 0 ? value : 0;
});

const categoryName = computed(() => vod.value?.categoryName ?? '影片');
const poster = computed(() => vod.value?.cover || '/img/poster-placeholder.svg');

/** 分类 id → 列表地址：一级分类直接进分类页，二级分类带 type 参数。 */
const categoryLink = computed(() => {
  const categoryId = vod.value?.categoryId;
  if (!categoryId) return '/list/all';
  const top = site.categories.find((item) => item.id === categoryId);
  if (top) return `/list/${top.alias}`;
  for (const item of site.categories) {
    const child = item.children.find((sub) => sub.id === categoryId);
    if (child) return `/list/${item.alias}?type=${child.alias}`;
  }
  return '/list/all';
});

function selectLine(lineId: string): void {
  router.replace({
    name: 'detail',
    params: { id: id.value },
    query: { ...route.query, line: lineId, ep: undefined },
  });
}

async function loadEpisodes(): Promise<void> {
  if (!selectedLine.value || !data.value) {
    episodes.value = [];
    return;
  }
  const index = lines.value.findIndex((line) => line.id === selectedLine.value?.id);
  if (index < 0) return;

  epLoading.value = true;
  try {
    const result = await portal.play(id.value, { line: index, ep: 1 });
    episodes.value = result.episodes;
  } catch {
    episodes.value = [];
  } finally {
    epLoading.value = false;
  }
}

let requestSeq = 0;

async function load(): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = '';
  data.value = null;
  episodes.value = [];
  try {
    const result = await portal.detail(id.value);
    if (seq !== requestSeq) return;
    data.value = result;
  } catch (e) {
    if (seq === requestSeq) error.value = (e as Error).message || '影片加载失败';
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch(id, load, { immediate: true });
watch(() => selectedLine.value?.id, loadEpisodes);

useSeo(() => ({
  title: vod.value
    ? `${vod.value.name} - ${categoryName.value} - ${site.config.siteName}`
    : `影片详情 - ${site.config.siteName}`,
  description: (vod.value?.content || vod.value?.remarks || site.config.siteSubtitle).slice(0, 120),
}));
</script>

<template>
  <div>
    <nav class="mb-4 mt-5 flex flex-wrap items-center gap-2 text-small text-ink-3">
      <RouterLink to="/" class="transition hover:text-primary">首页</RouterLink>
      <span>/</span>
      <RouterLink :to="categoryLink" class="transition hover:text-primary">{{ categoryName }}</RouterLink>
      <span>/</span>
      <span class="text-ink-2">{{ vod?.name ?? '影片详情' }}</span>
    </nav>

    <div v-if="loading" class="rounded-[14px] bg-surface p-5 shadow-card">
      <div class="flex flex-col gap-5 sm:flex-row">
        <Skeleton class="aspect-[2/3] w-[150px] shrink-0 rounded-[10px] sm:w-[200px]" />
        <div class="flex-1 space-y-3">
          <Skeleton class="h-7 w-2/3" />
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-4/5" />
        </div>
      </div>
    </div>
    <p v-else-if="error" class="my-6 rounded-[10px] border border-[#f3d1d1] bg-[#fdf3f3] px-4 py-5 text-center text-body text-danger">
      {{ error }}
    </p>

    <template v-else-if="vod">
      <section class="rounded-[14px] bg-surface p-5 shadow-card">
        <div class="flex flex-col gap-5 sm:flex-row sm:gap-6">
          <div class="mx-auto w-[150px] shrink-0 overflow-hidden rounded-[10px] bg-surface-2 sm:mx-0 sm:w-[200px]">
            <img :src="poster" :alt="vod.name" class="aspect-[2/3] h-full w-full object-cover" />
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <h1 class="text-[22px] font-bold leading-[1.3] text-ink sm:text-[28px]">{{ vod.name }}</h1>
            <p v-if="vod.subName" class="text-emphasis text-ink-3">{{ vod.subName }}</p>

            <div class="flex flex-wrap gap-x-4 gap-y-2 text-small text-ink-2">
              <span><b class="font-normal text-ink-3">分类：</b>{{ vod.categoryName || '未分类' }}</span>
              <span v-if="vod.year"><b class="font-normal text-ink-3">年份：</b>{{ vod.year }}</span>
              <span v-if="vod.area"><b class="font-normal text-ink-3">地区：</b>{{ vod.area }}</span>
              <span v-if="vod.lang"><b class="font-normal text-ink-3">语言：</b>{{ vod.lang }}</span>
              <span v-if="vod.releaseDate"><b class="font-normal text-ink-3">上映：</b>{{ vod.releaseDate }}</span>
              <span v-if="vod.director"><b class="font-normal text-ink-3">导演：</b>{{ vod.director }}</span>
              <span v-if="vod.actor"><b class="font-normal text-ink-3">主演：</b>{{ vod.actor }}</span>
              <span v-if="vod.remarks"><b class="font-normal text-ink-3">状态：</b>{{ vod.remarks }}</span>
            </div>

            <div class="mt-2 flex flex-wrap gap-3">
              <RouterLink
                v-if="selectedLine"
                :class="buttonClass({ variant: 'primary' })"
                :to="`/play/${vod.id}/${selectedLine.id}/1`"
              >
                立即播放
              </RouterLink>
              <RouterLink :class="buttonClass()" :to="categoryLink">同分类影片</RouterLink>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-4 rounded-[10px] bg-surface p-5 shadow-card">
        <h2 class="mb-3 text-title font-bold text-ink">剧情简介</h2>
        <p class="whitespace-pre-wrap leading-[1.9] text-ink-2">{{ vod.content || '暂无简介' }}</p>
      </section>

      <section class="mt-4 rounded-[10px] bg-surface p-5 shadow-card">
        <h2 class="mb-4 text-title font-bold text-ink">播放线路</h2>
        <template v-if="lines.length">
          <div class="mb-4 flex flex-wrap gap-2">
            <button
              v-for="line in lines"
              :key="line.id"
              type="button"
              :class="[
                'h-8 cursor-pointer rounded-pill border px-3 text-small transition',
                selectedLine?.id === line.id
                  ? 'border-primary-line bg-primary-weak font-semibold text-primary'
                  : 'border-line bg-surface text-ink-2 hover:border-primary-line hover:text-primary',
              ]"
              @click="selectLine(line.id)"
            >
              {{ line.name }}（{{ line.episodes }}集）
            </button>
          </div>

          <p v-if="epLoading" class="py-8 text-center text-body text-ink-3">剧集加载中…</p>
          <div
            v-else-if="episodes.length"
            class="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          >
            <RouterLink
              v-for="ep in episodes"
              :key="ep.index"
              :to="`/play/${vod.id}/${selectedLine?.id}/${ep.index}`"
              :class="[
                'block h-9 truncate rounded-lg border text-center text-small leading-[34px] transition',
                currentEp === ep.index
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-surface-2 text-ink-2 hover:border-primary-line hover:bg-primary-weak hover:text-primary',
              ]"
            >
              {{ ep.name }}
            </RouterLink>
          </div>
          <p v-else class="py-8 text-center text-body text-ink-3">该线路暂无剧集</p>
        </template>
        <p v-else class="py-8 text-center text-body text-ink-3">这部影片还没有可播放的线路</p>
      </section>

      <section v-if="data?.related.length" class="mt-4">
        <div class="mb-4 flex items-baseline gap-3">
          <h2 class="text-title font-bold text-ink">相关推荐</h2>
        </div>
        <VodGrid :items="data.related" />
      </section>
    </template>
  </div>
</template>
