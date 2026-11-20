<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import { setPageCategoryId } from '../composables/usePageCategoryId';
import PlayerBox from '../components/PlayerBox.vue';
import Skeleton from '../components/ui/Skeleton.vue';
import EpisodeSkeleton from '../components/ui/EpisodeSkeleton.vue';
import { useEpisodeCells } from '../composables/useEpisodeCells';

/** 自动连播：播完直接切下一集，不打断 */
const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');
/** 换线路失败只提示，不影响正在播的内容 */
const lineError = ref('');
const epsRef = ref<HTMLDivElement | null>(null);
const epsGridRef = ref<HTMLDivElement | null>(null);
const playerRef = ref<InstanceType<typeof PlayerBox> | null>(null);

/** 选集排序与详情页共用一份偏好：倒序 = 最新集在前 */
const EP_ORDER_KEY = 'lcm:ep-order';
const epDesc = ref(false);
try {
  epDesc.value = localStorage.getItem(EP_ORDER_KEY) === 'desc';
} catch {
  epDesc.value = false;
}

function toggleEpOrder(): void {
  epDesc.value = !epDesc.value;
  try {
    localStorage.setItem(EP_ORDER_KEY, epDesc.value ? 'desc' : 'asc');
  } catch {
    /* 存不了也不影响本次会话 */
  }
}

let requestSeq = 0;

const vod = computed(() => play.value?.vod ?? null);
const line = computed(() => play.value?.line ?? null);
const episodes = computed(() => play.value?.episodes ?? []);
const episodesShown = computed(() => (epDesc.value ? [...episodes.value].reverse() : episodes.value));

const { episodeCells } = useEpisodeCells(episodesShown, epsGridRef);
const current = computed(() => play.value?.current ?? 1);
const epItem = computed(() => episodes.value[current.value - 1] ?? null);
const player = computed(() => site.config.player);

const nextEp = computed(() => (current.value < episodes.value.length ? current.value + 1 : 0));
const prevEp = computed(() => (current.value > 1 ? current.value - 1 : 0));

/**
 * 自动连播开关：用户手动改过就记在本地（只影响这台设备），否则实时跟随站点配置。
 * 用 computed 而不是 ref 快照：站点配置是异步加载的，直达播放页时 setup 阶段还是默认值。
 */
const AUTONEXT_KEY = 'lcm:autonext';
const autonextPref = ref<boolean | null>(null);
try {
  const saved = localStorage.getItem(AUTONEXT_KEY);
  autonextPref.value = saved === '1' ? true : saved === '0' ? false : null;
} catch {
  /* 隐私模式读不到就按站点配置 */
}
const autonext = computed(() => autonextPref.value ?? site.config.player.autonext);

function toggleAutonext(): void {
  autonextPref.value = !autonext.value;
  try {
    localStorage.setItem(AUTONEXT_KEY, autonext.value ? '1' : '0');
  } catch {
    /* 存不了也不影响本次会话 */
  }
}

/** 标题右侧的小字：当前集 + 源站备注（线路名与总集数在下拉里已有，不重复） */
const subtitle = computed(() => {
  const parts: string[] = [];
  if (episodes.value.length > 1 && epItem.value) parts.push(epItem.value.name);
  const remarks = vod.value?.remarks ?? '';
  if (remarks) parts.push(remarks);
  return parts.join(' · ');
});

/** 在飞请求的中断句柄：换片/换线路/离开页面时把旧请求断掉，别占着连接和服务器 */
let loadController: AbortController | null = null;
let lineController: AbortController | null = null;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as Error)?.name === 'AbortError';
}

async function load(): Promise<void> {
  const seq = ++requestSeq;
  lineController?.abort();
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  const { signal } = controller;

  const vodId = String(route.params.id || '');
  const lineParam = typeof route.params.lineId === 'string' ? route.params.lineId : '';
  const epParam = Math.max(1, Number(route.params.ep) || 1);

  loading.value = true;
  error.value = '';
  try {
    // 先取线路列表（line=0），再按 URL 里的线路 id 换算成接口需要的 0 基下标。
    let result = await portal.play(vodId, { line: 0, ep: epParam }, { signal });
    if (seq !== requestSeq) return;

    let lineIndex = 0;
    if (lineParam) {
      const found = result.lines.findIndex((item) => item.id === lineParam);
      if (found >= 0) lineIndex = found;
    }
    if (lineIndex !== 0) {
      result = await portal.play(vodId, { line: lineIndex, ep: epParam }, { signal });
      if (seq !== requestSeq) return;
    }

    // 集数越界由服务端 clamp 并放在 result.current 里，这里不再多发一次请求
    play.value = result;
    // 小屏底栏靠它高亮所属的一级分类（播放页 URL 里只有影片 id）
    setPageCategoryId(result.vod.categoryId);

    const canonicalLine = result.line.id;
    const canonicalEp = String(result.current);
    if (lineParam !== canonicalLine || String(route.params.ep ?? '') !== canonicalEp) {
      await router.replace({ name: 'play', params: { id: vodId, lineId: canonicalLine, ep: canonicalEp } });
    }
  } catch (e) {
    if (isAbortError(e)) return;
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
let lineSeq = 0;

async function switchLineInPlace(lineId: string, ep: number): Promise<boolean> {
  const p = play.value;
  if (!p) return false;
  const lineIndex = p.lines.findIndex((item) => item.id === lineId);
  if (lineIndex < 0) return false;

  // 连点线路时只认最后一次：先发后到的响应直接丢掉，否则画面与地址栏会错位
  const seq = ++lineSeq;
  lineController?.abort();
  const controller = new AbortController();
  lineController = controller;

  playerRef.value?.saveProgress();
  lineError.value = '';
  try {
    const next = await portal.play(String(p.vod.id), { line: lineIndex, ep }, { signal: controller.signal });
    if (seq !== lineSeq) return false;
    play.value = next;
    return true;
  } catch (e) {
    if (isAbortError(e) || seq !== lineSeq) return false;
    // 只影响线路区域，不把整页播放器顶掉
    lineError.value = (e as Error).message || '切换线路失败';
    return false;
  }
}

/** 切线路时保持当前集；新线路没这么多集才回落到它的最后一集 */
async function selectLine(lineId: string, lineEpisodes: number): Promise<void> {
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

function onEnded(): void {
  if (!autonext.value || !nextEp.value) return;
  selectEp(nextEp.value);
}

/** 当前集滚到选集区中间，切线路/切集后都能看到它 */
async function scrollToCurrent(): Promise<void> {
  await nextTick();
  const box = epsRef.value;
  if (!box) return;
  const active = box.querySelector<HTMLElement>('[data-active="1"]');
  if (!active) return;
  // 用相对视口的矩形差算位移：offsetTop 会受最近定位祖先影响，卡片里会算偏
  const boxRect = box.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  box.scrollTop += activeRect.top - boxRect.top - box.clientHeight / 2 + activeRect.height / 2;
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
  loadController?.abort();
  lineController?.abort();
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
    <!-- 骨架按真实版式摆：播放器 + 标题/控制行 + 线路 tab + 选集区（--ep-max-h） -->
    <div v-if="loading">
      <Skeleton class="aspect-video w-full rounded-md" />

      <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div class="flex min-w-0 flex-1 basis-full items-baseline gap-3 sm:basis-auto">
          <Skeleton class="h-6 w-40" />
          <Skeleton class="h-[22px] w-24" />
        </div>
        <div class="ml-auto flex flex-none items-center gap-2">
          <Skeleton class="h-8 w-20" />
          <Skeleton class="h-8 w-20" />
        </div>
      </div>

      <EpisodeSkeleton class="mt-4" />
    </div>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <div v-else-if="play && vod && line">
      <div class="relative aspect-video overflow-hidden rounded-md bg-black">
        <PlayerBox
          ref="playerRef"
          :src="epItem?.url ?? ''"
          :play-src="epItem?.playUrl ?? epItem?.url ?? ''"
          :parse-url="line.parseUrl"
          :autoplay="player.autoplay"
          :resume="player.resume"
          :resume-key="`${vod.id}:${line.id}:${current}`"
          :screenshot="player.screenshot"
          :fullscreen="player.fullscreen"
          :webfullscreen="player.webfullscreen"
          :setting="player.setting"
          @ended="onEnded"
        />
      </div>

      <!-- 标题行：片名 + 当前集，右端是播放控制（上一集 / 下一集 / 自动连播） -->
      <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div class="flex min-w-0 flex-1 basis-full items-baseline gap-3 sm:basis-auto">
          <RouterLink
            :to="`/detail/${vod.id}`"
            :title="vod.name"
            class="min-w-0 truncate text-[20px] font-semibold leading-tight text-ink hover:text-primary"
          >
            {{ vod.name }}
          </RouterLink>
          <span class="shrink-0 truncate text-small text-ink-3">{{ subtitle }}</span>
        </div>

        <div class="ml-auto flex flex-none items-center gap-2">
          <button
            type="button"
            class="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-small text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:bg-transparent disabled:text-line"
            :disabled="!prevEp"
            @click="selectEp(prevEp)"
          >
            <ChevronLeft :size="16" class="shrink-0" />
            上一集
          </button>
          <button
            type="button"
            class="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-small text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:bg-transparent disabled:text-line"
            :disabled="!nextEp"
            @click="selectEp(nextEp)"
          >
            下一集
            <ChevronRight :size="16" class="shrink-0" />
          </button>

          <label
            v-if="episodes.length > 1"
            class="ml-2 flex cursor-pointer items-center gap-2 text-small text-ink-2"
          >
            自动连播
            <button
              type="button"
              class="relative h-[22px] w-[38px] flex-none cursor-pointer rounded-full transition"
              :class="autonext ? 'bg-primary' : 'bg-surface-3'"
              @click="toggleAutonext"
            >
              <span
                class="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all"
                :class="autonext ? 'left-[19px]' : 'left-[3px]'"
              />
            </button>
          </label>
        </div>
      </div>

      <!-- 线路与选集：和详情页同一套写法（下划线 tab + 网格），切集仍就地换源 -->
      <section class="mt-4">
        <div class="mb-4 flex items-end gap-4 border-b border-line">
          <div
            class="-mb-px flex min-w-0 flex-1 gap-4 overflow-x-auto sm:gap-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              v-for="item in play.lines"
              :id="`play-line-tab-${item.id}`"
              :key="item.id"
              type="button"
              class="flex-none cursor-pointer whitespace-nowrap pb-2 pt-2 text-body transition"
              :class="
                item.id === line.id
                  ? 'text-primary shadow-[inset_0_-2px_0_var(--color-primary)]'
                  : 'text-ink-2 hover:text-ink'
              "
              @click="selectLine(item.id, item.episodes)"
            >
              {{ item.name }}
            </button>
          </div>
          <button
            type="button"
            class="-mb-px flex-none cursor-pointer pb-2 pt-2 text-small text-ink-3 transition hover:text-ink"
            :title="epDesc ? '当前倒序，点击切回正序' : '当前正序，点击切换为倒序'"
            @click="toggleEpOrder"
          >
            {{ epDesc ? '倒序' : '正序' }}
          </button>
        </div>

        <!-- 换线路失败只在这里提示：正在播的内容和播放器都不动 -->
        <p v-if="lineError" class="mb-3 rounded bg-danger/10 px-3 py-2 text-small text-danger">
          {{ lineError }}
        </p>

        <div ref="epsRef" class="max-h-[var(--ep-max-h)] overflow-y-auto">
          <div
            ref="epsGridRef"
            class="grid grid-cols-4 gap-[var(--ep-gap)] sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          >
            <button
              v-for="ep in episodeCells"
              :key="ep.index"
              type="button"
              :title="ep.name"
              :data-active="ep.index === current ? '1' : undefined"
              class="h-[var(--ep-cell-h)] cursor-pointer truncate rounded text-center text-caption leading-[var(--ep-cell-h)] transition"
              :class="[
                ep.index === current
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
                ep.span > 1 ? 'px-2 text-left' : '',
              ]"
              :style="ep.span > 1 ? { gridColumn: `span ${ep.span}` } : undefined"
              @click="selectEp(ep.index)"
            >
              {{ ep.name }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
