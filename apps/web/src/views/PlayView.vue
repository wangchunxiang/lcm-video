<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import PlayerBox from '../components/PlayerBox.vue';
import Icon from '../components/Icon.vue';

const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');
const lineOpen = ref(false);

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
  lineOpen.value = false;
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
  lineOpen.value = false;
  void router.push({ name: 'play', params: { id: String(route.params.id), lineId, ep: '1' } });
}

function selectEp(index: number): void {
  if (!line.value || index === current.value || index < 1) return;
  void router.push({
    name: 'play',
    params: { id: String(route.params.id), lineId: line.value.id, ep: String(index) },
  });
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
  <div class="pt-4">
    <p v-if="loading" class="py-16 text-center text-body text-ink-3">加载中…</p>
    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <template v-else-if="play && vod && line">
      <div class="relative lg:pr-[392px]">
        <div class="min-w-0">
          <div class="relative aspect-video overflow-hidden rounded-md bg-black">
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

          <div class="mt-3 flex flex-wrap items-baseline gap-2">
            <RouterLink :to="`/detail/${vod.id}`" class="text-emphasis font-semibold text-ink hover:text-primary">
              {{ vod.name }}
            </RouterLink>
            <span class="text-caption text-ink-3">{{ epItem?.name }}</span>
            <span class="text-caption text-ink-3">· {{ line.name }} · 共 {{ episodes.length }} 集</span>
          </div>
        </div>

        <aside class="mt-4 flex flex-col gap-3 lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:w-[380px]">
          <div class="flex items-baseline gap-2">
            <RouterLink
              :to="`/detail/${vod.id}`"
              :title="vod.name"
              class="truncate text-emphasis font-semibold text-ink hover:text-primary"
            >
              {{ vod.name }}
            </RouterLink>
            <span class="ml-auto flex-none text-caption text-ink-3">{{ epItem?.name }}</span>
          </div>

          <div class="relative">
            <button
              type="button"
              class="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded bg-surface px-3 text-small text-ink-2 transition hover:bg-surface-2"
              :aria-expanded="lineOpen"
              @click="lineOpen = !lineOpen"
            >
              <span class="truncate">{{ line.name }}</span>
              <span class="flex flex-none items-center gap-1 text-caption text-ink-3">
                {{ line.episodes }} 集
                <Icon name="chevron-down" :size="14" />
              </span>
            </button>

            <div
              v-if="lineOpen"
              class="absolute inset-x-0 top-full z-10 mt-1 max-h-[320px] overflow-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
            >
              <button
                v-for="item in play.lines"
                :key="item.id"
                type="button"
                class="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-[7px] text-left text-small transition"
                :class="
                  item.id === line.id
                    ? 'bg-[rgba(59,130,246,0.16)] text-primary'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-primary'
                "
                @click="selectLine(item.id)"
              >
                <span class="truncate">{{ item.name }}</span>
                <span class="flex-none text-caption text-ink-3">{{ item.episodes }} 集</span>
              </button>
            </div>
          </div>

          <div class="max-h-[420px] overflow-y-auto pr-1">
            <div class="grid grid-cols-5 gap-2 lg:grid-cols-4">
              <button
                v-for="ep in episodes"
                :key="ep.index"
                type="button"
                :title="ep.name"
                class="h-7 cursor-pointer truncate rounded bg-surface-2 text-caption text-ink-2 transition hover:bg-[rgba(59,130,246,0.18)] hover:text-primary"
                :class="ep.index === current ? 'bg-primary text-white hover:bg-primary hover:text-white' : ''"
                @click="selectEp(ep.index)"
              >
                {{ ep.name }}
              </button>
            </div>
          </div>

          <div class="flex justify-between text-small">
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1 text-ink-3 transition hover:text-primary disabled:cursor-not-allowed disabled:text-line"
              :disabled="!prevEp"
              @click="selectEp(prevEp)"
            >
              <Icon name="chevron-left" :size="14" />
              上一集
            </button>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1 text-ink-3 transition hover:text-primary disabled:cursor-not-allowed disabled:text-line"
              :disabled="!nextEp"
              @click="selectEp(nextEp)"
            >
              下一集
              <Icon name="chevron-right" :size="14" />
            </button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
