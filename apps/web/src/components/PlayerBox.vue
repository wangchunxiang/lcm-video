<script setup lang="ts">
import Player from 'xgplayer';
import HlsPlugin from 'xgplayer-hls';
import 'xgplayer/dist/index.min.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { readPref, removePref, writePref } from '../composables/usePref';

const props = withDefaults(
  defineProps<{
    src: string;
    /**
     * 直链播放用的地址，通常是后端签出的播放列表代理（`/api/web/playlist`）。
     * 留空时用 `src`；解析型源仍用 `src` 拼 iframe，两者分工不同。
     */
    playSrc?: string;
    /** 采集源的解析接口；非空时用 iframe 打开解析页 */
    parseUrl?: string;
    autoplay?: boolean;
    resume?: boolean;
    /** 断点续播的存储键，通常是 `${vodId}:${playId}` */
    resumeKey?: string;
    /** 以下四个开关来自后台「播放设置」 */
    screenshot?: boolean;
    fullscreen?: boolean;
    webfullscreen?: boolean;
    setting?: boolean;
  }>(),
  {
    playSrc: '',
    parseUrl: '',
    autoplay: false,
    resume: false,
    resumeKey: '',
    screenshot: false,
    fullscreen: true,
    webfullscreen: true,
    setting: false,
  },
);

const emit = defineEmits<{ ended: []; error: [] }>();

/** 本站的播放列表代理：`/api/web/playlist?sourceId=..&u=..&sig=..`（见 `playlist-proxy.ts`） */
const PLAYLIST_PROXY = /\/api\/web\/playlist(?:\?|$)/;

/**
 * 这条地址该不该交给 HlsPlugin。
 *
 * 注意 xgplayer 的插件一旦在创建时挂上就会接管所有地址、不看后缀，所以 mp4 直链必须
 * **不挂**插件，留给原生内核；也正因为插件集合在创建时就固定了，换集时内核种类变了
 * 只能重建实例（`inferType()` 那种「按后缀告诉播放器怎么解」的做法在这里不适用）。
 */
function isHls(url: string): boolean {
  return PLAYLIST_PROXY.test(url) || /\.m3u8(?:[?#]|$)/i.test(url);
}

/**
 * iOS 上要不要绕过系统播放器（AVPlayer）走 MSE 管线。
 *
 * 内核选择本身完全由 xgplayer 负责，我们不判断 UA：
 * - `false`（xgplayer 默认）：HlsPlugin 发现只有 ManagedMediaSource、没有 MediaSource 时
 *   主动让位，`video.src` 交给系统播放器；
 * - `true`：iOS 17.1+ 上也走 MSE 缓冲管线。
 *
 * 排障时用 `?mms=1` 临时切换，不用改代码重新构建。
 */
const PREFER_MMS = /\bmms=1\b/.test(location.search);


/** 排障信息：只有 URL 带 `?debug=1` 时才有值（手机上没有 devtools 可看） */
const DEBUG = /\bdebug=1\b/.test(location.search);

const containerRef = ref<HTMLDivElement | null>(null);
const debugInfo = ref('');

/** 直链播放地址：优先用代理地址，没有就回落到原始地址 */
const directSrc = computed(() => props.playSrc || props.src);

const iframeSrc = computed(() => {
  if (!props.parseUrl) return '';
  if (props.parseUrl.includes('{url}')) {
    return props.parseUrl.replace('{url}', encodeURIComponent(props.src));
  }
  return props.parseUrl + props.src;
});

const RESUME_PREFIX = 'lcm:resume:';

/** xgplayer `error` 事件里我们用到的那部分字段（内核已经替我们采集好了） */
interface PlaybackError {
  errorType?: string;
  errorCode?: number;
  message?: string;
  readyState?: number;
  networkState?: number;
}

let player: Player | null = null;
/** 当前实例的内核种类：决定换集时能否就地 `switchURL`，还是必须重建 */
let mountedKind: 'hls' | 'direct' = 'hls';
let lastSaveAt = 0;
/** 当前这一集是否已经发过 ended：timeupdate 兜底与原生 ended 只取一次 */
let endedSent = false;

function resumeStorageKey(): string {
  return props.resumeKey ? RESUME_PREFIX + props.resumeKey : '';
}

/** 续播起点：读不到就是 0，交给 xgplayer 的 `startTime` 去 seek */
function resumeStartTime(): number {
  if (!props.resume || !props.resumeKey) return 0;
  const saved = Number(readPref(resumeStorageKey()) ?? 0);
  return Number.isFinite(saved) && saved > 5 ? saved : 0;
}

function destroyPlayer(): void {
  player?.destroy();
  player = null;
}

function saveProgress(force = false): void {
  if (!player || !props.resume || !props.resumeKey) return;
  const now = Date.now();
  if (!force && now - lastSaveAt < 5000) return;
  lastSaveAt = now;
  if (player.currentTime > 5) {
    writePref(resumeStorageKey(), String(Math.floor(player.currentTime)));
  }
}

/** 这一集播完：清掉续播点并通知父组件（两个 ended 入口共用） */
function finish(): void {
  if (endedSent) return;
  endedSent = true;
  if (props.resume && props.resumeKey) removePref(resumeStorageKey());
  emit('ended');
}

defineExpose({ saveProgress });

/**
 * 排障用的错误描述：只在 URL 带 `?debug=1` 时展示。
 * 字段几乎全部来自 xgplayer 抛出的 Errors（它已经把 readyState/networkState/errorCode 采好了），
 * 我们只补两个它不知道的：内核种类、这台设备有没有 ManagedMediaSource。
 * 地址用我们传进去的那条（走 MSE 时 `error.src` 只会是 `blob:`，看不出是哪条线路）。
 */
function describeFailure(error: PlaybackError): string {
  if (!DEBUG) return '';
  return [
    `code=${error.errorCode ?? '-'} type=${error.errorType ?? '-'} msg=${error.message || '-'}`,
    `readyState=${error.readyState ?? '-'} networkState=${error.networkState ?? '-'}`,
    `kernel=${mountedKind} mms=${'ManagedMediaSource' in window ? 'yes' : 'no'}`,
    `src=${directSrc.value.slice(0, 120)}`,
  ].join(' | ');
}

function createPlayer(): void {
  const container = containerRef.value;
  if (!container || !directSrc.value) return;

  destroyPlayer();
  debugInfo.value = '';
  endedSent = false;

  const hls = isHls(directSrc.value);
  mountedKind = hls ? 'hls' : 'direct';

  // 后台「播放设置」里关掉的控件：xgplayer 内置插件靠 ignores 关，不用自己藏
  const ignores: string[] = [];
  if (!props.fullscreen) ignores.push('fullscreen');
  // 「播放设置」里的倍速与清晰度开关，对应 xgplayer 的两个独立插件
  // （插件名叫 playbackRate，忽略列表比较时两边都转小写）
  if (!props.setting) ignores.push('playbackRate', 'definition');

  player = new Player({
    el: container,
    width: '100%',
    height: '100%',
    url: directSrc.value,
    plugins: hls ? [HlsPlugin] : [],
    hls: { preferMMS: PREFER_MMS },
    lang: 'zh-cn',
    autoplay: props.autoplay,
    volume: 0.7,
    playsinline: true,
    videoAttributes: { preload: 'metadata' },
    startTime: resumeStartTime(),
    screenShot: props.screenshot,
    cssFullscreen: props.webfullscreen,
    pip: true,
    ignores,
    // 主题色：已播进度条 / 拖拽钮 / 音量条（其余红色在下方 CSS 里覆盖）
    commonStyle: {
      playedColor: 'var(--primary)',
      sliderBtnStyle: { background: 'var(--primary)' },
      volumeColor: 'var(--primary)',
    },
  });

  player.on('ended', finish);
  player.on('timeupdate', () => {
    saveProgress();
    // 兜底：个别源站/内核到结尾时不派发 ended，这里按「离结尾不到 0.5 秒」判定一次
    if (!player) return;
    const { duration, currentTime } = player;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (duration - currentTime < 0.5) finish();
  });
  // 失败提示与「刷新」按钮由内置 ErrorPlugin 负责，这里只记录排障信息并通知父组件
  player.on('error', (error: PlaybackError) => {
    debugInfo.value = describeFailure(error);
    emit('error');
  });
  player.on('canplay', () => {
    debugInfo.value = '';
  });
}

/**
 * 换集：同一内核种类就地换源（不销毁实例，避免黑一下），种类变了才重建。
 *
 * 两条分支的区别是有原因的：`player.handleSource` 为 false 说明 HlsPlugin 接管了数据源
 *（MSE 管线），它把 switchURL 换成了支持 `{ currentTime }` 的版本；为 true 说明走的还是
 * `<video>` 自己（mp4 直链，或 iOS 上插件让位给 AVPlayer），而内核自带的 switchURL 会
 *「从当前位置接着播」（把起点设成当前 currentTime，并忽略入参），换集时必须自己 seek。
 */
async function switchEpisode(next: string): Promise<void> {
  const inst = player;
  if (!inst) return;
  if (isHls(next) !== (mountedKind === 'hls')) {
    createPlayer();
    return;
  }
  // 换走前先把上一集的进度落盘（续播键带集数，不写就丢了）
  saveProgress(true);
  debugInfo.value = '';
  lastSaveAt = 0;
  endedSent = false;
  const start = resumeStartTime();

  if (!inst.handleSource) {
    try {
      await inst.switchURL(next, { currentTime: start });
    } catch {
      // 拿到 canplay 之前遇到 error 会 reject；失败提示本身由内置 ErrorPlugin 接管
    }
    return;
  }

  inst.src = next;
  inst.once('loadedmetadata', () => {
    if (player !== inst) return;
    // 换集后应从头/从续播点开播，而不是接着上一集的进度
    inst.currentTime = inst.duration > 0 ? Math.min(start, inst.duration) : start;
    void inst.play();
  });
}

watch(
  () => directSrc.value,
  async (next, prev) => {
    if (!next) return;
    await nextTick();
    if (iframeSrc.value) {
      // 解析页走 iframe：换地址时由 v-if 重新挂载，不需要保留实例
      destroyPlayer();
      return;
    }
    if (player && prev) {
      await switchEpisode(next);
      return;
    }
    createPlayer();
  },
  { flush: 'post' },
);

onMounted(() => {
  if (!iframeSrc.value) createPlayer();
});

onBeforeUnmount(destroyPlayer);
</script>

<template>
  <div class="player-box relative h-full w-full bg-black">
    <iframe
      v-if="iframeSrc"
      :src="iframeSrc"
      class="h-full w-full border-0"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      referrerpolicy="no-referrer"
    ></iframe>
    <div v-else ref="containerRef" class="h-full w-full"></div>
    <!-- 手机上没有 devtools，`?debug=1` 时把内核状态直接画在画面上 -->
    <div
      v-if="debugInfo"
      class="pointer-events-none absolute inset-x-0 top-0 break-all bg-black/70 px-2 py-1 font-mono text-xs text-white/80"
    >
      {{ debugInfo }}
    </div>
  </div>
</template>

<style scoped>
.player-box :deep(.xgplayer) {
  width: 100%;
  height: 100%;
}

/* xgplayer 的红色写死在这几处，commonStyle 管不到，用站点主色盖掉 */
.player-box :deep(.xgplayer-error .xgplayer-error-refresh),
.player-box :deep(.xgplayer .xg-options-list li:hover),
.player-box :deep(.xgplayer .xg-options-list li.selected),
.player-box :deep(.xgplayer xg-trigger .time-preview .xg-cur) {
  color: var(--primary);
}
</style>
