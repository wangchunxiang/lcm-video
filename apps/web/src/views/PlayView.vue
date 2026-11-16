<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import PlayerBox from '../components/PlayerBox.vue';
import Skeleton from '../components/ui/Skeleton.vue';

/** 选集分组：每 50 集一个 tab，避免几百集时一屏塞不下 */
const GROUP_SIZE = 50;
/** 自动连播倒计时（秒），期间可取消 */
const AUTONEXT_SECONDS = 5;

const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');
const lineOpen = ref(false);
const activeGroup = ref(0);
const countdown = ref(0);
const epsRef = ref<HTMLDivElement | null>(null);
const epsWrapRef = ref<HTMLDivElement | null>(null);
/** 选集区高度按整行吸附，避免底部露出半行 */
const epsHeight = ref(0);

let countdownTimer: number | undefined;
let epsObserver: ResizeObserver | null = null;
let requestSeq = 0;

const vod = computed(() => play.value?.vod ?? null);
const line = computed(() => play.value?.line ?? null);
const episodes = computed(() => play.value?.episodes ?? []);
const current = computed(() => play.value?.current ?? 1);
const epItem = computed(() => episodes.value[current.value - 1] ?? null);
const player = computed(() => site.config.player);

const prevEp = computed(() => (current.value > 1 ? current.value - 1 : 0));
const nextEp = computed(() => (current.value < episodes.value.length ? current.value + 1 : 0));
const nextEpItem = computed(() => (nextEp.value ? episodes.value[nextEp.value - 1] : null));

/** 集数多时按 50 集分组，只有一组时不渲染 tab */
const groups = computed(() => {
  const total = episodes.value.length;
  const list: Array<{ index: number; label: string }> = [];
  for (let start = 0; start < total; start += GROUP_SIZE) {
    list.push({
      index: list.length,
      label: `${start + 1}-${Math.min(start + GROUP_SIZE, total)}`,
    });
  }
  return list;
});

const groupEpisodes = computed(() =>
  episodes.value.slice(activeGroup.value * GROUP_SIZE, (activeGroup.value + 1) * GROUP_SIZE),
);

async function load(): Promise<void> {
  const seq = ++requestSeq;
  const vodId = String(route.params.id || '');
  const lineParam = typeof route.params.lineId === 'string' ? route.params.lineId : '';
  const epParam = Math.max(1, Number(route.params.ep) || 1);

  loading.value = true;
  error.value = '';
  lineOpen.value = false;
  stopCountdown();
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

/** 切线路时保持当前集；新线路没这么多集才回落到它的最后一集 */
function selectLine(lineId: string, lineEpisodes: number): void {
  lineOpen.value = false;
  stopCountdown();
  const ep = Math.max(1, Math.min(current.value, lineEpisodes || current.value));
  void router.push({ name: 'play', params: { id: String(route.params.id), lineId, ep: String(ep) } });
}

function selectEp(index: number): void {
  if (!line.value || index === current.value || index < 1) return;
  stopCountdown();
  void router.push({
    name: 'play',
    params: { id: String(route.params.id), lineId: line.value.id, ep: String(index) },
  });
}

function stopCountdown(): void {
  if (countdownTimer !== undefined) {
    window.clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
  countdown.value = 0;
}

function startCountdown(): void {
  stopCountdown();
  countdown.value = AUTONEXT_SECONDS;
  countdownTimer = window.setInterval(() => {
    countdown.value -= 1;
    if (countdown.value > 0) return;
    stopCountdown();
    if (nextEp.value) selectEp(nextEp.value);
  }, 1000);
}

function onEnded(): void {
  if (!player.value.autonext || !nextEp.value) return;
  startCountdown();
}

/** 当前集滚到选集区中间，切线路/切集后都能看到它 */
async function scrollToCurrent(): Promise<void> {
  await nextTick();
  const box = epsRef.value;
  if (!box) return;
  const active = box.querySelector<HTMLElement>('[data-active="1"]');
  if (!active) return;
  box.scrollTop = Math.max(0, active.offsetTop - box.clientHeight / 2 + active.clientHeight / 2);
}

watch(
  () => [route.params.id, route.params.lineId, route.params.ep],
  () => void load(),
  { immediate: true },
);

watch(current, (value) => {
  const group = Math.floor((value - 1) / GROUP_SIZE);
  if (group !== activeGroup.value) activeGroup.value = group;
  void scrollToCurrent();
});

watch(activeGroup, () => void scrollToCurrent());

/**
 * 选集区高度按整行吸附：容器高度随卡片剩余空间变化，
 * 直接用 max-height 会在底部露出半行，这里量一次可用高度再算成整数行。
 */
function measureEpisodes(): void {
  const wrap = epsWrapRef.value;
  if (!wrap) return;
  const style = getComputedStyle(wrap);
  const cell = Number.parseFloat(style.getPropertyValue('--ep-cell-h')) || 30;
  const gap = Number.parseFloat(style.getPropertyValue('--ep-gap')) || 8;
  const max = Number.parseFloat(style.getPropertyValue('--ep-max-h')) || 372;
  const available = Math.min(wrap.clientHeight, max);
  if (available <= 0) return;
  const rows = Math.max(1, Math.floor((available + gap) / (cell + gap)));
  epsHeight.value = rows * cell + (rows - 1) * gap;
}

watch(epsWrapRef, (wrap) => {
  epsObserver?.disconnect();
  epsObserver = null;
  if (!wrap) return;
  epsObserver = new ResizeObserver(() => measureEpisodes());
  epsObserver.observe(wrap);
  measureEpisodes();
});

onBeforeUnmount(() => {
  stopCountdown();
  epsObserver?.disconnect();
});

useSeo(() => ({
  title: vod.value
    ? `${vod.value.name} ${epItem.value?.name ?? ''} - ${line.value?.name ?? ''} - ${site.config.siteName}`
    : `在线播放 - ${site.config.siteName}`,
  description: vod.value?.remarks || site.config.siteSubtitle,
}));
</script>

<template>
  <div class="pt-4">
    <div v-if="loading" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Skeleton class="aspect-video w-full rounded-md" />
      <Skeleton class="h-72 rounded-lg" />
    </div>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <div v-else-if="play && vod && line" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="min-w-0">
        <div class="relative aspect-video overflow-hidden rounded-md bg-black">
          <PlayerBox
            :src="epItem?.url ?? ''"
            :parse-url="line.parseUrl"
            :poster="vod.cover"
            :autoplay="player.autoplay"
            :resume="player.resume"
            :resume-key="`${vod.id}:${line.id}`"
            :screenshot="player.screenshot"
            :fullscreen="player.fullscreen"
            :webfullscreen="player.webfullscreen"
            :setting="player.setting"
            @ended="onEnded"
          />

          <!-- 自动连播倒计时：叠在播放器底部，可取消 -->
          <div
            v-if="countdown > 0"
            class="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-glass px-4 py-2 text-small text-ink backdrop-blur-xl"
          >
            <span>{{ countdown }} 秒后播放 {{ nextEpItem?.name }}</span>
            <button
              type="button"
              class="ml-auto h-8 cursor-pointer rounded-md px-4 text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              @click="stopCountdown"
            >
              取消
            </button>
            <button
              type="button"
              class="h-8 cursor-pointer rounded-md bg-primary px-4 text-white transition hover:bg-primary-strong"
              @click="selectEp(nextEp)"
            >
              立即播放
            </button>
          </div>
        </div>
      </div>

      <!-- 右侧：线路 + 选集。桌面端高度与播放器对齐，选集在卡片内部滚动 -->
      <div class="relative">
        <aside class="flex flex-col gap-4 rounded-lg bg-surface p-5 lg:absolute lg:inset-0">
          <div class="flex flex-col gap-1">
            <RouterLink
              :to="`/detail/${vod.id}`"
              :title="vod.name"
              class="truncate text-emphasis font-semibold text-ink"
            >
              {{ vod.name }}
            </RouterLink>
            <span class="truncate text-caption text-ink-3">
              {{ epItem?.name }} · {{ line.name }} · 共 {{ episodes.length }} 集
            </span>
          </div>

          <div class="relative">
            <button
              type="button"
              class="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line px-4 text-small text-ink-2 transition hover:border-ink-3/50 hover:text-ink"
              :aria-expanded="lineOpen"
              @click="lineOpen = !lineOpen"
            >
              <span class="truncate">{{ line.name }}</span>
              <span class="flex flex-none items-center gap-1 text-caption text-ink-3">
                {{ line.episodes }} 集
                <ChevronDown :size="16" class="shrink-0" />
              </span>
            </button>

            <div
              v-if="lineOpen"
              class="absolute inset-x-0 top-full z-20 mt-1 max-h-[320px] overflow-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
            >
              <button
                v-for="item in play.lines"
                :key="item.id"
                type="button"
                class="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-4 text-left text-small transition"
                :class="
                  item.id === line.id
                    ? 'bg-primary-weak text-primary'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                "
                @click="selectLine(item.id, item.episodes)"
              >
                <span class="truncate">{{ item.name }}</span>
                <span class="flex-none text-caption text-ink-3">{{ item.episodes }} 集</span>
              </button>
            </div>
          </div>

          <!-- 集数很多时分组会超过一行，横向滚动而不是换行堆高 -->
          <div v-if="groups.length > 1" class="flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="group in groups"
              :key="group.index"
              type="button"
              class="h-8 shrink-0 cursor-pointer rounded-sm px-4 text-small transition"
              :class="
                group.index === activeGroup
                  ? 'bg-primary-weak text-primary'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              "
              @click="activeGroup = group.index"
            >
              {{ group.label }}
            </button>
          </div>

          <div ref="epsWrapRef" class="min-h-0 flex-1 max-lg:max-h-[var(--ep-max-h)]">
            <div
              ref="epsRef"
              class="grid grid-cols-4 gap-2 overflow-y-auto"
              :style="epsHeight ? { height: `${epsHeight}px` } : undefined"
            >
              <button
                v-for="ep in groupEpisodes"
                :key="ep.index"
                type="button"
                :title="ep.name"
                :data-active="ep.index === current ? '1' : undefined"
                class="h-[var(--ep-cell-h)] cursor-pointer truncate rounded-sm px-2 text-caption transition"
                :class="
                  ep.index === current
                    ? 'bg-primary text-white hover:bg-primary-strong'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink'
                "
                @click="selectEp(ep.index)"
              >
                {{ ep.name }}
              </button>
            </div>
          </div>

          <div class="mt-auto flex items-center gap-2 border-t border-line pt-4">
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-4 text-small text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent"
              :disabled="!prevEp"
              @click="selectEp(prevEp)"
            >
              <ChevronLeft :size="16" class="shrink-0" />
              上一集
            </button>
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-4 text-small text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent"
              :disabled="!nextEp"
              @click="selectEp(nextEp)"
            >
              下一集
              <ChevronRight :size="16" class="shrink-0" />
            </button>
            <span class="ml-auto text-caption text-ink-3">
              自动连播：{{ player.autonext ? '开' : '关' }}
            </span>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
