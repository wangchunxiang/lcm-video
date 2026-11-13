<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import PlayerBox from '../components/PlayerBox.vue';
import Button from '../components/ui/Button.vue';

const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');

const vod = computed(() => play.value?.vod ?? null);
const line = computed(() => play.value?.line ?? null);
const episodes = computed(() => play.value?.episodes ?? []);
const current = computed(() => play.value?.current ?? 1);
const epItem = computed(() => episodes.value[current.value - 1] ?? null);
const player = computed(() => site.config.player);

const prevEp = computed(() => (current.value > 1 ? current.value - 1 : 0));
const nextEp = computed(() => (current.value < episodes.value.length ? current.value + 1 : 0));

let requestSeq = 0;

async function load(): Promise<void> {
  const seq = ++requestSeq;
  const vodId = String(route.params.id || '');
  const lineParam = typeof route.params.lineId === 'string' ? route.params.lineId : '';
  const epParam = Math.max(1, Number(route.params.ep) || 1);

  loading.value = true;
  error.value = '';
  try {
    // 先取线路列表（line=0），再按 URL 里的线路 id 换算成接口需要的 0 基下标。
    let result = await portal.play(vodId, { line: 0, ep: epParam });
    if (seq !== requestSeq) return;

    let lineIndex = 0;
    if (lineParam) {
      const found = result.lines.findIndex((item) => item.id === lineParam);
      if (found >= 0) lineIndex = found;
    }
    if (lineIndex !== 0) {
      result = await portal.play(vodId, { line: lineIndex, ep: epParam });
      if (seq !== requestSeq) return;
    }

    if (result.episodes.length && epParam > result.episodes.length) {
      result = await portal.play(vodId, { line: lineIndex, ep: result.episodes.length });
      if (seq !== requestSeq) return;
    }

    play.value = result;

    const canonicalLine = result.line.id;
    const canonicalEp = String(result.current);
    if (lineParam !== canonicalLine || String(route.params.ep ?? '') !== canonicalEp) {
      await router.replace({ name: 'play', params: { id: vodId, lineId: canonicalLine, ep: canonicalEp } });
    }
  } catch (e) {
    if (seq === requestSeq) {
      play.value = null;
      error.value = (e as Error).message || '播放页加载失败';
    }
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function selectLine(lineId: string): void {
  router.push({ name: 'play', params: { id: String(route.params.id), lineId, ep: '1' } });
}

function selectEp(index: number): void {
  if (!line.value || index === current.value) return;
  router.push({ name: 'play', params: { id: String(route.params.id), lineId: line.value.id, ep: String(index) } });
}

function onEnded(): void {
  if (player.value.autonext && nextEp.value) selectEp(nextEp.value);
}

watch(() => [route.params.id, route.params.lineId, route.params.ep], load, { immediate: true });

useSeo(() => ({
  title: vod.value
    ? `${vod.value.name} ${epItem.value?.name ?? ''} - ${line.value?.name ?? ''} - ${site.config.siteName}`
    : `在线播放 - ${site.config.siteName}`,
  description: vod.value?.remarks || site.config.siteSubtitle,
}));
</script>

<template>
  <div>
    <nav class="mb-4 mt-5 flex flex-wrap items-center gap-2 text-small text-ink-3">
      <RouterLink to="/" class="transition hover:text-primary">首页</RouterLink>
      <span>/</span>
      <RouterLink v-if="vod" :to="`/detail/${vod.id}`" class="transition hover:text-primary">{{ vod.name }}</RouterLink>
      <span v-if="vod">/</span>
      <span class="text-ink-2">{{ epItem?.name ?? '在线播放' }}</span>
    </nav>

    <p v-if="loading" class="py-16 text-center text-body text-ink-3">加载中…</p>
    <p v-else-if="error" class="my-6 rounded-[10px] border border-[#f3d1d1] bg-[#fdf3f3] px-4 py-5 text-center text-body text-danger">
      {{ error }}
    </p>

    <template v-else-if="play && vod && line">
      <div class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div class="min-w-0">
          <div class="relative aspect-video overflow-hidden rounded-[10px] bg-black">
            <PlayerBox
              :src="epItem?.url ?? ''"
              :parse-url="line.parseUrl"
              :poster="vod.cover"
              :autoplay="player.autoplay"
              :resume="player.resume"
              :resume-key="`${vod.id}:${line.id}`"
              @ended="onEnded"
            />
          </div>

          <section class="mt-4 rounded-[10px] bg-surface p-5 shadow-card">
            <h1 class="mb-2 text-title font-bold text-ink">{{ vod.name }} · {{ epItem?.name }}</h1>
            <p class="text-small leading-[1.9] text-ink-2">
              当前线路：{{ line.name }} · 共 {{ episodes.length }} 集 · {{ vod.remarks || '高清' }}
            </p>
            <p class="text-small leading-[1.9]">
              <RouterLink :to="`/detail/${vod.id}`" class="text-ink-2 transition hover:text-primary">
                查看影片详情 ›
              </RouterLink>
            </p>
          </section>
        </div>

        <aside class="flex flex-col gap-3 rounded-[10px] bg-surface p-5 shadow-card">
          <div class="flex flex-col gap-1">
            <RouterLink :to="`/detail/${vod.id}`" class="text-small text-ink-2 transition hover:text-primary">
              {{ vod.name }}
            </RouterLink>
            <span class="text-emphasis font-semibold text-ink">选集（{{ episodes.length }}）</span>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="item in play.lines"
              :key="item.id"
              type="button"
              :class="[
                'h-8 cursor-pointer rounded-pill border px-3 text-small transition',
                item.id === line.id
                  ? 'border-primary-line bg-primary-weak font-semibold text-primary'
                  : 'border-line bg-surface text-ink-2 hover:border-primary-line hover:text-primary',
              ]"
              @click="selectLine(item.id)"
            >
              {{ item.name }}
            </button>
          </div>

          <div class="max-h-[320px] overflow-y-auto pr-1 lg:max-h-[420px]">
            <div class="grid grid-cols-5 gap-1.5 sm:grid-cols-6 xl:grid-cols-5">
              <button
                v-for="ep in episodes"
                :key="ep.index"
                type="button"
                :class="[
                  'h-9 cursor-pointer truncate rounded-lg border text-small transition',
                  ep.index === current
                    ? 'border-primary bg-primary text-white'
                    : 'border-line bg-surface-2 text-ink-2 hover:border-primary-line hover:bg-primary-weak hover:text-primary',
                ]"
                @click="selectEp(ep.index)"
              >
                {{ ep.name }}
              </button>
            </div>
          </div>

          <div class="flex gap-2">
            <Button size="sm" class="flex-1" :disabled="!prevEp" @click="selectEp(prevEp)">上一集</Button>
            <Button size="sm" class="flex-1" :disabled="!nextEp" @click="selectEp(nextEp)">下一集</Button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
