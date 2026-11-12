<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type EpisodeItem, type VodDetail } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';

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
    <nav class="crumb">
      <RouterLink to="/">首页</RouterLink>
      <span>/</span>
      <RouterLink :to="categoryLink">{{ categoryName }}</RouterLink>
      <span>/</span>
      <span>{{ vod?.name ?? '影片详情' }}</span>
    </nav>

    <p v-if="loading" class="loading-tip">加载中…</p>
    <p v-else-if="error" class="error-box">{{ error }}</p>

    <template v-else-if="vod">
      <section class="detail-banner">
        <div class="detail-poster">
          <img :src="poster" :alt="vod.name" />
        </div>
        <div class="detail-info">
          <h1 class="detail-title">{{ vod.name }}</h1>
          <p v-if="vod.subName" class="detail-sub">{{ vod.subName }}</p>
          <div class="detail-meta">
            <span><b>分类：</b>{{ vod.categoryName || '未分类' }}</span>
            <span v-if="vod.year"><b>年份：</b>{{ vod.year }}</span>
            <span v-if="vod.area"><b>地区：</b>{{ vod.area }}</span>
            <span v-if="vod.lang"><b>语言：</b>{{ vod.lang }}</span>
            <span v-if="vod.releaseDate"><b>上映：</b>{{ vod.releaseDate }}</span>
            <span v-if="vod.director"><b>导演：</b>{{ vod.director }}</span>
            <span v-if="vod.actor"><b>主演：</b>{{ vod.actor }}</span>
            <span v-if="vod.remarks"><b>状态：</b>{{ vod.remarks }}</span>
          </div>
          <div class="detail-actions">
            <RouterLink
              v-if="selectedLine"
              class="btn btn-primary"
              :to="`/play/${vod.id}/${selectedLine.id}/1`"
            >
              立即播放
            </RouterLink>
            <RouterLink class="btn" :to="categoryLink">同分类影片</RouterLink>
          </div>
        </div>
      </section>

      <section class="detail-content">
        <h2>剧情简介</h2>
        <p>{{ vod.content || '暂无简介' }}</p>
      </section>

      <section class="detail-lines">
        <h2>播放线路</h2>
        <template v-if="lines.length">
          <div class="line-pills">
            <button
              v-for="line in lines"
              :key="line.id"
              class="chip"
              :class="{ 'is-on': selectedLine?.id === line.id }"
              type="button"
              @click="selectLine(line.id)"
            >
              {{ line.name }}（{{ line.episodes }}集）
            </button>
          </div>
          <p v-if="epLoading" class="loading-tip">剧集加载中…</p>
          <div v-else-if="episodes.length" class="ep-grid">
            <RouterLink
              v-for="ep in episodes"
              :key="ep.index"
              class="ep-btn"
              :class="{ 'is-on': currentEp === ep.index }"
              :to="`/play/${vod.id}/${selectedLine?.id}/${ep.index}`"
            >
              {{ ep.name }}
            </RouterLink>
          </div>
          <p v-else class="empty-tip">该线路暂无剧集</p>
        </template>
        <p v-else class="empty-tip">这部影片还没有可播放的线路</p>
      </section>

      <section v-if="data?.related.length" class="section detail-related">
        <div class="section-head">
          <h2 class="section-title">相关推荐</h2>
        </div>
        <VodGrid :items="data.related" />
      </section>
    </template>
  </div>
</template>
