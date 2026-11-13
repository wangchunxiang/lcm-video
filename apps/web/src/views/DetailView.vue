<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type EpisodeItem, type VodDetail } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
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
  <div class="pt-4">
    <div v-if="loading" class="flex flex-col gap-5 lg:flex-row">
      <Skeleton class="aspect-[3/4] w-[200px] flex-none rounded-md" />
      <div class="flex-1 space-y-3">
        <Skeleton class="h-8 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
        <Skeleton class="h-4 w-full" />
      </div>
    </div>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <template v-else-if="vod">
      <section class="flex gap-8 pb-6 max-lg:flex-col max-lg:gap-5">
        <img
          :src="poster"
          :alt="vod.name"
          class="h-[320px] w-[240px] flex-none rounded-md bg-surface-2 object-fill max-lg:mx-auto max-lg:h-[300px] max-lg:w-[200px]"
        />

        <div class="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <div class="flex flex-col gap-3">
            <h1 class="text-[32px] leading-[1.25] font-bold text-ink max-lg:text-[24px]">{{ vod.name }}</h1>
            <p v-if="vod.subName" class="text-body text-ink-2">{{ vod.subName }}</p>

            <div class="flex flex-wrap gap-2">
              <span v-if="vod.year" class="rounded bg-[rgba(59,130,246,0.22)] px-2 py-1 text-caption text-[#93c5fd]">
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
              <div class="flex gap-3">
                <dt class="w-[42px] flex-none text-ink-3">导演</dt>
                <dd class="text-ink-2">{{ vod.director || '—' }}</dd>
              </div>
              <div class="flex gap-3">
                <dt class="w-[42px] flex-none text-ink-3">演员</dt>
                <dd class="text-ink-2">{{ vod.actor || '—' }}</dd>
              </div>
              <div v-if="vod.releaseDate" class="flex gap-3">
                <dt class="w-[42px] flex-none text-ink-3">上映</dt>
                <dd class="text-ink-2">{{ vod.releaseDate }}</dd>
              </div>
              <div v-if="intro" class="flex gap-3">
                <dt class="w-[42px] flex-none text-ink-3">简介</dt>
                <dd class="min-w-0 flex-1">
                  <p class="whitespace-pre-wrap leading-[1.9] text-ink-2" :class="introOpen ? '' : 'line-clamp-2'">
                    {{ intro }}
                  </p>
                  <button
                    type="button"
                    class="mt-1 cursor-pointer text-small text-primary hover:underline"
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
              class="inline-flex h-[38px] items-center rounded-md bg-primary px-6 text-body text-white transition hover:bg-primary-strong"
            >
              立即播放
            </RouterLink>
            <RouterLink
              to="/list/all"
              class="inline-flex h-[38px] items-center rounded-md border border-line bg-surface-2 px-5 text-body text-ink-2 transition hover:border-primary-line hover:text-primary"
            >
              全部影片
            </RouterLink>
          </div>
        </div>
      </section>

      <section v-if="lines.length" class="pb-2">
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="line in lines"
            :key="line.id"
            type="button"
            class="inline-flex h-8 cursor-pointer items-center rounded px-4 text-small transition"
            :class="
              selectedLine?.id === line.id
                ? 'bg-[rgba(59,130,246,0.16)] text-primary'
                : 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-primary'
            "
            @click="selectLine(line.id)"
          >
            {{ line.name }}
            <span class="ml-1 text-caption text-ink-3">{{ line.episodes }} 集</span>
          </button>
        </div>

        <p v-if="epLoading" class="py-10 text-center text-body text-ink-3">剧集加载中…</p>
        <div v-else-if="episodes.length" class="max-h-[420px] overflow-y-auto">
          <div class="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            <RouterLink
              v-for="ep in episodes"
              :key="ep.index"
              :to="`/play/${vod.id}/${selectedLine?.id}/${ep.index}`"
              :title="ep.name"
              class="h-7 truncate rounded bg-surface-2 text-center text-caption leading-7 transition hover:bg-[rgba(59,130,246,0.18)] hover:text-primary"
              :class="currentEp === ep.index ? 'bg-primary text-white hover:bg-primary hover:text-white' : 'text-ink-2'"
            >
              {{ ep.name }}
            </RouterLink>
          </div>
        </div>
        <p v-else class="py-10 text-center text-body text-ink-3">该线路暂无剧集</p>
      </section>

      <section v-if="data?.related.length" class="mt-4">
        <div class="mb-4 flex items-baseline">
          <h2 class="text-section font-bold text-ink">相关推荐</h2>
        </div>
        <VodGrid :items="data.related" />
      </section>
    </template>
  </div>
</template>
