<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { isAbortError, portal, type VodPlay } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import { pageCategoryId } from '../composables/usePageCategoryId';
import { readPref, writePref } from '../composables/usePref';
import PlayerBox from '../components/PlayerBox.vue';
import Skeleton from '../components/ui/Skeleton.vue';
import EpisodeSkeleton from '../components/ui/EpisodeSkeleton.vue';

/** 自动连播：播完直接切下一集，不打断 */
const route = useRoute();
const router = useRouter();

const play = ref<VodPlay | null>(null);
const loading = ref(true);
const error = ref('');
/** 换线路失败只提示，不影响正在播的内容 */
const lineError = ref('');
const epsRef = ref<HTMLDivElement | null>(null);
const playerRef = ref<InstanceType<typeof PlayerBox> | null>(null);

/** 选集排序与详情页共用一份偏好：倒序 = 最新集在前 */
const EP_ORDER_KEY = 'lcm:ep-order';
const epDesc = ref(readPref(EP_ORDER_KEY) === 'desc');

function toggleEpOrder(): void {
  epDesc.value = !epDesc.value;
  writePref(EP_ORDER_KEY, epDesc.value ? 'desc' : 'asc');
}

const vod = computed(() => play.value?.vod ?? null);
const line = computed(() => play.value?.line ?? null);
const episodes = computed(() => play.value?.episodes ?? []);
const episodesShown = computed(() => (epDesc.value ? [...episodes.value].reverse() : episodes.value));

/** 当前集以地址栏为准（越界时夹到最后一集），换集/换线路后由地址栏纠偏 */
const current = computed(() => {
  const total = episodes.value.length;
  if (total === 0) return 1;
  const fromUrl = Number(route.params.ep);
  const wanted =
    Number.isFinite(fromUrl) && fromUrl >= 1 ? Math.floor(fromUrl) : (play.value?.current ?? 1);
  return Math.min(Math.max(1, wanted), total);
});
const epItem = computed(() => episodes.value[current.value - 1] ?? null);
const player = computed(() => site.config.player);

const nextEp = computed(() => (current.value < episodes.value.length ? current.value + 1 : 0));
const prevEp = computed(() => (current.value > 1 ? current.value - 1 : 0));

/**
 * 自动连播开关：用户手动改过就记在本地（只影响这台设备），否则实时跟随站点配置。
 * 用 computed 而不是 ref 快照：站点配置是异步加载的，直达播放页时 setup 阶段还是默认值。
 */
const AUTONEXT_KEY = 'lcm:autonext';
const savedAutonext = readPref(AUTONEXT_KEY);
const autonextPref = ref<boolean | null>(
  savedAutonext === '1' ? true : savedAutonext === '0' ? false : null,
);
const autonext = computed(() => autonextPref.value ?? site.config.player.autonext);

function toggleAutonext(): void {
  autonextPref.value = !autonext.value;
  writePref(AUTONEXT_KEY, autonext.value ? '1' : '0');
}

/** 标题右侧的小字：只显示当前集名（片名就在左边、备注已在页面其他地方） */
const subtitle = computed(() => {
  if (episodes.value.length <= 1) return '';
  return epItem.value?.name ?? '';
});

/** 在飞请求只认最后一次：换片/换线路时中断旧请求，回调也按序号判断是否过期 */
let controller: AbortController | null = null;
let requestSeq = 0;

type FetchPlayOptions = {
  /** 同剧换线路：失败只提示，不顶掉正在播的内容 */
  keepPlayer?: boolean;
  /** 成功后地址栏怎么走：进页面/纠偏用 replace，用户切线路用 push */
  history?: 'replace' | 'push';
};

/** 拉取某条线路的播放数据；线路由服务端按 lineId 直接定位，一次请求拿全 */
async function fetchPlay(
  vodId: string,
  lineId: string,
  ep: number,
  { keepPlayer = false, history = 'replace' }: FetchPlayOptions = {},
): Promise<void> {
  controller?.abort();
  const pending = new AbortController();
  controller = pending;
  const seq = ++requestSeq;

  if (keepPlayer) {
    playerRef.value?.saveProgress();
    lineError.value = '';
  } else {
    loading.value = true;
    error.value = '';
  }

  try {
    const result = await portal.play(vodId, { lineId: lineId || undefined, ep }, { signal: pending.signal });
    if (seq !== requestSeq) return;

    play.value = result;
    // 小屏底栏靠它高亮所属的一级分类（播放页 URL 里只有影片 id）
    pageCategoryId.value = result.vod.categoryId;

    const params = { id: vodId, lineId: result.line.id, ep: String(result.current) };
    const inSync =
      String(route.params.lineId ?? '') === params.lineId && String(route.params.ep ?? '') === params.ep;
    if (!inSync) {
      await (history === 'push' ? router.push({ name: 'play', params }) : router.replace({ name: 'play', params }));
    }
  } catch (e) {
    if (isAbortError(e) || seq !== requestSeq) return;
    const message = (e as Error).message || '播放页加载失败';
    if (keepPlayer) {
      // 只影响线路区域，不把整页播放器顶掉
      lineError.value = message;
    } else {
      play.value = null;
      error.value = message;
    }
  } finally {
    // 已经被新请求接管时不要去关骨架屏：那时新的那次已经把它打开了
    if (seq === requestSeq) loading.value = false;
  }
}

/** 切线路时保持当前集；新线路没这么多集才回落到它的最后一集 */
function selectLine(lineId: string, lineEpisodes: number): void {
  const p = play.value;
  if (!p || lineId === p.line.id) return;
  const ep = Math.min(current.value, lineEpisodes || current.value);
  void fetchPlay(String(p.vod.id), lineId, ep, { keepPlayer: true, history: 'push' });
}

/** 选集：地址栏是唯一真源，这里只负责跳转（播放器跟着 computed 换源） */
function selectEp(index: number): void {
  const p = play.value;
  if (!p || index < 1 || index > p.episodes.length || index === current.value) return;
  playerRef.value?.saveProgress();
  void router.push({ name: 'play', params: { id: String(p.vod.id), lineId: p.line.id, ep: String(index) } });
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
  // 用相对视口的差值算位移：offsetTop 会受最近定位祖先影响，卡片里会算偏
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

    // 同一部片同一条线路：当前集完全由地址栏派生，不请求；只把越界集数纠回最后一集
    if (p && vodId === String(p.vod.id) && (!lineId || lineId === p.line.id)) {
      // 浏览器前进/后退也会走到这里，切换前先把进度落盘
      if (ep !== p.current) playerRef.value?.saveProgress();
      if (ep > p.episodes.length) {
        void router.replace({
          name: 'play',
          params: { id: vodId, lineId: p.line.id, ep: String(p.episodes.length) },
        });
      }
      return;
    }

    // 换片整页重载；同剧换线路保留播放器
    void fetchPlay(vodId, lineId, ep, { keepPlayer: Boolean(p && vodId === String(p.vod.id)) });
  },
  { immediate: true },
);

watch(current, () => void scrollToCurrent());

onBeforeUnmount(() => controller?.abort());

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
          <span class="min-w-0 truncate text-small text-ink-3">{{ subtitle }}</span>
        </div>

        <!-- 小屏：这一行整行给它，上一集/下一集贴行首、自动连播贴行尾 -->
        <div class="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:flex-none">
          <div class="flex items-center gap-2">
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
          </div>

          <label
            v-if="episodes.length > 1"
            class="ml-auto flex cursor-pointer items-center gap-2 text-small text-ink-2 sm:ml-2"
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
          <div class="grid grid-cols-4 gap-[var(--ep-gap)] sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            <button
              v-for="ep in episodesShown"
              :key="ep.index"
              type="button"
              :title="ep.name"
              :data-active="ep.index === current ? '1' : undefined"
              class="h-[var(--ep-cell-h)] min-w-0 cursor-pointer truncate rounded px-1 text-center text-caption leading-[var(--ep-cell-h)] transition"
              :class="
                ep.index === current
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink'
              "
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
