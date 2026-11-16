<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown } from 'lucide-vue-next';
import { portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import PlayerBox from '../components/PlayerBox.vue';
import Skeleton from '../components/ui/Skeleton.vue';

/** 自动连播倒计时（秒），期间可取消 */
const AUTONEXT_SECONDS = 5;

const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');
const lineOpen = ref(false);
const countdown = ref(0);
const epsRef = ref<HTMLDivElement | null>(null);
const playerRef = ref<InstanceType<typeof PlayerBox> | null>(null);

let countdownTimer: number | undefined;
let requestSeq = 0;

const vod = computed(() => play.value?.vod ?? null);
const line = computed(() => play.value?.line ?? null);
const episodes = computed(() => play.value?.episodes ?? []);
const current = computed(() => play.value?.current ?? 1);
const epItem = computed(() => episodes.value[current.value - 1] ?? null);
const player = computed(() => site.config.player);

const nextEp = computed(() => (current.value < episodes.value.length ? current.value + 1 : 0));
const nextEpItem = computed(() => (nextEp.value ? episodes.value[nextEp.value - 1] : null));

/** 标题右侧的小字：当前集 + 源站备注（线路名与总集数在下拉里已有，不重复） */
const subtitle = computed(() => {
  const parts: string[] = [];
  if (episodes.value.length > 1 && epItem.value) parts.push(epItem.value.name);
  const remarks = vod.value?.remarks ?? '';
  if (remarks) parts.push(remarks);
  return parts.join(' · ');
});

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

/**
 * 换到另一条线路：要取一次新线路的集数列表，但播放器不重建。
 * 返回是否切换成功（失败时由调用方决定是否整页重载）。
 */
async function switchLineInPlace(lineId: string, ep: number): Promise<boolean> {
  const p = play.value;
  if (!p) return false;
  const lineIndex = p.lines.findIndex((item) => item.id === lineId);
  if (lineIndex < 0) return false;

  playerRef.value?.saveProgress();
  stopCountdown();
  try {
    const next = await portal.play(String(p.vod.id), { line: lineIndex, ep });
    play.value = next;
    return true;
  } catch (e) {
    error.value = (e as Error).message || '切换线路失败';
    return false;
  }
}

/** 切线路时保持当前集；新线路没这么多集才回落到它的最后一集 */
async function selectLine(lineId: string, lineEpisodes: number): Promise<void> {
  lineOpen.value = false;
  const p = play.value;
  if (!p) return;
  const ep = Math.max(1, Math.min(p.current, lineEpisodes || p.current));

  if (lineId === p.line.id) {
    applyEp(ep);
    await router.push({
      name: 'play',
      params: { id: String(p.vod.id), lineId, ep: String(p.current) },
    });
    return;
  }

  if (!(await switchLineInPlace(lineId, ep))) return;
  const next = play.value;
  await router.push({
    name: 'play',
    params: { id: String(p.vod.id), lineId, ep: String(next?.current ?? ep) },
  });
}

/** 就地换集：只改 current，播放器换源、地址栏更新，不再请求接口 */
function applyEp(index: number): void {
  const p = play.value;
  if (!p || index < 1 || index > p.episodes.length || index === p.current) return;
  playerRef.value?.saveProgress();
  stopCountdown();
  p.current = index;
}

function selectEp(index: number): void {
  const p = play.value;
  if (!p || index < 1 || index > p.episodes.length) return;
  applyEp(index);
  void router.push({
    name: 'play',
    params: { id: String(p.vod.id), lineId: p.line.id, ep: String(p.current) },
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
  () => {
    const vodId = String(route.params.id || '');
    const lineId = typeof route.params.lineId === 'string' ? route.params.lineId : '';
    const ep = Math.max(1, Number(route.params.ep) || 1);
    const p = play.value;

    // 同一部片：同线路只换集，不同线路取一次数据后就地换源（前进/后退也走这里）
    if (p && vodId === String(p.vod.id)) {
      if (lineId === p.line.id && ep <= p.episodes.length) {
        applyEp(ep);
        return;
      }
      if (lineId !== p.line.id) {
        void switchLineInPlace(lineId, ep).then((ok) => {
          if (!ok) void load();
        });
        return;
      }
    }
    void load();
  },
  { immediate: true },
);

watch(current, () => void scrollToCurrent());

onBeforeUnmount(() => {
  stopCountdown();
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

    <div v-else-if="play && vod && line">
      <!-- 桌面端标题与集数一行；窄屏折成两行，避免片名被截得只剩几个字 -->
      <div class="mb-4 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
        <RouterLink
          :to="`/detail/${vod.id}`"
          :title="vod.name"
          class="min-w-0 truncate text-[20px] font-semibold leading-tight text-ink hover:text-primary"
        >
          {{ vod.name }}
        </RouterLink>
        <span class="shrink-0 truncate text-caption text-ink-3">{{ subtitle }}</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="min-w-0">
        <div class="relative aspect-video overflow-hidden rounded-md bg-black">
          <PlayerBox
            ref="playerRef"
            :src="epItem?.url ?? ''"
            :parse-url="line.parseUrl"
            :poster="vod.cover"
            :autoplay="player.autoplay"
            :resume="player.resume"
            :resume-key="`${vod.id}:${line.id}:${current}`"
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

          <div class="min-h-0 flex-1 max-lg:max-h-[var(--ep-max-h)]">
            <div
              ref="epsRef"
              class="grid h-full max-lg:max-h-[var(--ep-max-h)] grid-cols-4 content-start gap-2 overflow-y-auto"
            >
              <button
                v-for="ep in episodes"
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
        </aside>
      </div>
      </div>
    </div>
  </div>
</template>
