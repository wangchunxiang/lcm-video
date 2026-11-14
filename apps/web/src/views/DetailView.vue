<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type EpisodeItem, type VodDetail } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import Container from '../components/layout/Container.vue';
import Skeleton from '../components/ui/Skeleton.vue';

const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id || ''));
const data = ref<VodDetail | null>(null);
const loading = ref(true);
const error = ref('');
const episodes = ref<EpisodeItem[]>([]);
const epLoading = ref(false);
const introOpen = ref(false);

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
/** 影片挂在二级分类上（如「港台剧」），这里回溯到一级分类，给「浏览分类」按钮落地址 */
const topCategory = computed(() => {
  const id = vod.value?.categoryId;
  if (!id) return null;
  return (
    site.categories.find(
      (item) => item.id === id || item.children.some((child) => child.id === id),
    ) ?? null
  );
});
const browseTo = computed(() => (topCategory.value ? `/list/${topCategory.value.alias}` : ''));
const browseLabel = computed(() => (topCategory.value ? `浏览${topCategory.value.name}` : ''));
const poster = computed(() => vod.value?.cover || '/img/poster-placeholder.svg');
const intro = computed(() => vod.value?.content?.trim() ?? '');

function selectLine(lineId: string): void {
  void router.replace({
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
  introOpen.value = false;
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
  description: (intro.value || vod.value?.remarks || site.config.siteSubtitle).slice(0, 120),
}));
</script>

<template>
  <div>
    <Container v-if="loading" class="pt-4">
      <div class="flex flex-col gap-4 lg:flex-row">
        <Skeleton class="aspect-[2/3] w-[240px] flex-none rounded-md" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-8 w-2/3" />
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-4 w-full" />
        </div>
      </div>
    </Container>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <template v-else-if="vod">
      <!-- 顶部横幅：封面放大虚化垫底，前面压渐变接到页面底色；横幅通栏，内容仍收进 Container -->
      <section class="relative isolate overflow-hidden">
        <div class="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            v-if="vod.cover"
            class="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-2xl max-lg:blur-lg"
            :style="{ backgroundImage: `url(${vod.cover})` }"
          />
          <div
            class="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,12,15,0.55),rgba(10,12,15,0.72)_55%,var(--bg))]"
          />
        </div>

        <Container class="relative">
          <div class="flex gap-8 py-4 max-lg:flex-col max-lg:gap-4">
        <img
          :src="poster"
          :alt="vod.name"
          class="aspect-[2/3] w-[240px] flex-none rounded-md bg-surface-2 object-fill max-lg:w-[200px]"
        />

        <div class="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div class="flex flex-col gap-4">
            <h1 class="text-page leading-tight font-bold text-ink">{{ vod.name }}</h1>
            <p v-if="vod.subName" class="text-body text-ink-2">{{ vod.subName }}</p>

            <div class="flex flex-wrap gap-2">
              <span v-if="vod.year" class="rounded bg-primary-weak px-2 py-1 text-caption text-primary">
                {{ vod.year }}
              </span>
              <span v-if="vod.categoryName" class="rounded bg-surface-2 px-2 py-1 text-caption text-ink-2">
                {{ vod.categoryName }}
              </span>
              <span v-if="vod.remarks" class="rounded bg-surface-2 px-2 py-1 text-caption text-ink-2">
                {{ vod.remarks }}
              </span>
            </div>

            <dl class="grid gap-2 text-body">
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">导演</dt>
                <dd class="text-ink-2">{{ vod.director || '—' }}</dd>
              </div>
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">演员</dt>
                <dd class="text-ink-2">{{ vod.actor || '—' }}</dd>
              </div>
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">上映</dt>
                <dd class="text-ink-2">{{ vod.releaseDate }}</dd>
              </div>
              <div class="flex gap-4">
                <dt class="w-[42px] flex-none text-ink-3">简介</dt>
                <dd class="min-w-0 flex-1">
                  <p class="whitespace-pre-wrap leading-[1.9] text-ink-2" :class="introOpen ? '' : 'line-clamp-2'">
                    {{ intro }}
                  </p>
                  <button
                    type="button"
                    class="mt-1 cursor-pointer text-small text-ink-2 transition hover:text-ink"
                    @click="introOpen = !introOpen"
                  >
                    {{ introOpen ? '收起' : '详情' }}
                  </button>
                </dd>
              </div>
            </dl>
          </div>

          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-if="selectedLine"
              :to="`/play/${vod.id}/${selectedLine.id}/1`"
              class="inline-flex h-[38px] items-center rounded-md bg-primary px-4 text-body text-white transition hover:bg-primary-strong"
            >
              立即播放
            </RouterLink>
            <RouterLink
              v-if="browseTo"
              :to="browseTo"
              class="inline-flex h-[38px] items-center rounded-md border border-line bg-surface-2 px-4 text-body text-ink-2 transition hover:border-ink-3/50 hover:text-ink"
            >
              {{ browseLabel }}
            </RouterLink>
          </div>
          </div>
          </div>
        </Container>
      </section>

      <Container class="pt-4">
        <section v-if="lines.length" class="pb-4">
        <div class="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span class="w-8 flex-none text-small text-ink-3">线路</span>
          <button
            v-for="line in lines"
            :key="line.id"
            type="button"
            class="inline-flex h-8 cursor-pointer items-center rounded px-4 text-small transition"
            :class="
              selectedLine?.id === line.id
                ? 'bg-primary-weak text-primary'
                : 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'
            "
            :aria-pressed="selectedLine?.id === line.id"
            @click="selectLine(line.id)"
          >
            {{ line.name }}
            <span class="ml-1 text-caption text-ink-3">{{ line.episodes }} 集</span>
          </button>
        </div>

        <p v-if="epLoading" class="py-8 text-center text-body text-ink-3">剧集加载中…</p>
        <div v-else-if="episodes.length" class="max-h-[420px] overflow-y-auto">
          <div class="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            <RouterLink
              v-for="ep in episodes"
              :key="ep.index"
              :to="`/play/${vod.id}/${selectedLine?.id}/${ep.index}`"
              :title="ep.name"
              :aria-current="currentEp === ep.index ? 'page' : undefined"
              class="h-[30px] truncate rounded bg-surface-2 text-center text-caption leading-[30px] transition hover:bg-surface-3 hover:text-ink"
              :class="currentEp === ep.index ? 'bg-primary text-white hover:bg-primary hover:text-white' : 'text-ink-2'"
            >
              {{ ep.name }}
            </RouterLink>
          </div>
        </div>
        <p v-else class="py-8 text-center text-body text-ink-3">该线路暂无剧集</p>
      </section>

      <section v-if="data?.related.length">
        <div class="mb-4 flex items-baseline">
          <h2 class="text-section font-bold text-ink">相关推荐</h2>
        </div>
        <VodGrid :items="data.related" />
      </section>
      </Container>
    </template>
  </div>
</template>
