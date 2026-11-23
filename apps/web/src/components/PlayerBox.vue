<script setup lang="ts">
import Artplayer from 'artplayer';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

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
 * 给 ArtPlayer 判内核类型。
 *
 * artplayer 的 `url` setter 是 `option.type || 由地址后缀推断`，随后 `customType[类型]`：
 * 类型对不上就 `video.src = url` 裸赋值。所以 `option.type` 不能只会是空串：
 * 直链地址多半是 `.../index.m3u8`，后缀能推对；但走去广告代理时地址是
 * `/api/web/playlist?...`——既没后缀、还带查询串，推出来的东西不在 `customType` 里，
 * hls.js 永远拿不到这条流，Chrome/Firefox 只能得到 MEDIA_ERR_SRC_NOT_SUPPORTED(4)，
 * 界面就是「该线路暂不支持在线播放」，而且控制台不报任何 JS 错。
 */
function inferType(url: string): string {
  return PLAYLIST_PROXY.test(url) || /\.m3u8(?:[?#]|$)/i.test(url) ? 'm3u8' : '';
}

/*
 * 失败提示只有一句中性文案。
 *
 * 曾经试过按 `MediaError.code` 和补探出来的 HTTP 状态码细分（「网络连接异常」
 * 「线路暂时不可用」等），但 iOS 的原生内核会对着同一个拉不到的地址反复报错：
 * 每报一次就先把中性文案写上、再被探测结果覆盖，文字在两句之间来回跳，
 * 用户看到的就是画面在闪。细分带来的那点信息量不值一次闪屏，全删了。
 */
const NEUTRAL_FAILURE = '播放失败，请稍后重试或换线路';


const containerRef = ref<HTMLDivElement | null>(null);
const failedText = ref('');

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

/**
 * hls.js 动态导入后的类型：只声明用到的那部分。
 * 它的 d.ts 是 `export default class Hls`，但动态 import 的命名空间类型在
 * `moduleResolution: Bundler` 下拿不到构造签名，这里显式声明更稳。
 */
interface HlsPlayer {
  loadSource(url: string): void;
  attachMedia(media: HTMLVideoElement): void;
  recoverMediaError(): void;
  destroy(): void;
  on(
    event: string,
    listener: (
      event: string,
      data: { fatal?: boolean; type?: string },
    ) => void,
  ): void;
}

interface HlsConstructor {
  new (config: { enableWorker: boolean; lowLatencyMode: boolean; maxAudioFramesDrift: number }): HlsPlayer;
  isSupported(): boolean;
  Events: { ERROR: string };
  ErrorTypes: { MEDIA_ERROR: string };
}

let art: Artplayer | null = null;
let hls: HlsPlayer | null = null;
/** hls.js 动态加载令牌：换集或销毁后让上一次加载的回调失效 */
let loadToken = 0;
let lastSaveAt = 0;
/** 当前这一集是否已经发过 ended：timeupdate 兜底与原生 ended 只取一次 */
let endedSent = false;

function resumeStorageKey(): string {
  return props.resumeKey ? RESUME_PREFIX + props.resumeKey : '';
}

function destroyPlayer(): void {
  loadToken += 1;
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (art) {
    art.destroy(false);
    art = null;
  }
}

/**
 * ArtPlayer 的 m3u8 自定义内核。
 * iOS/Safari 原生支持 m3u8，直接交给内核可避免带 Origin 的跨域请求（部分源站 WAF 会拦）；
 * 其余浏览器用 hls.js，致命错误时回退到原生内核再试一次。
 *
 * hls.js 压缩后约 400KB，只有真正需要时才动态加载，不拖慢首屏（播放器外壳先出来）。
 */
/**
 * 原生 HLS 能不能放。
 * 只问 `application/vnd.apple.mpegurl` 不够：iOS 17.1 之后部分内核（含 iOS 上的第三方壳）
 * 对它返回空串，只认 `application/x-mpegURL`，于是会被误判成「不支持」。三个都问一遍。
 */
const NATIVE_HLS_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegURL', 'audio/mpegurl'];

/**
 * 是否 iPhone/iPad。
 * 这类设备没有 MSE，hls.js 永远起不来，只能走原生内核 —— 哪怕 canPlayType 说不行。
 */
function isAppleMobile(): boolean {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13 起 UA 伪装成 Macintosh，用触摸点区分
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * ArtPlayer 的 m3u8 自定义内核。
 * 顺序是「hls.js 优先、原生兜底」，不能反过来：Chrome/Firefox 对 HLS 的 canPlayType
 * 会回 "maybe"，但真把 m3u8 塞给 video.src 只会得到 MEDIA_ERR_SRC_NOT_SUPPORTED（code 4），
 * 于是每个非 Safari 浏览器都会卡在「不支持在线播放」。
 * iPhone/iPad 没有 MSE，hls.js 起不来，直接交给原生内核（也省掉 400KB 的下载）。
 */
function playM3u8(video: HTMLVideoElement, url: string, _player: Artplayer): void {
  // 就地换集时同一个实例会被再次调用，先把上一条流的 hls 实例销毁，避免残留监听
  if (hls) {
    hls.destroy();
    hls = null;
  }
  // 换集/卸载会让上一次的动态加载作废，用令牌判断回调是否还有效
  const token = ++loadToken;

  const playNatively = (): void => {
    video.src = url;
  };

  const unsupported = (): void => {
    failedText.value = NEUTRAL_FAILURE;
    emit('error');
  };

  if (isAppleMobile()) {
    playNatively();
    return;
  }

  void import('hls.js')
    .then((module) => {
      if (token !== loadToken) return;
      const Hls = (module as unknown as { default: HlsConstructor }).default;
      if (!Hls.isSupported()) {
        // 没有 MSE 但内核自己认 HLS（macOS Safari 之外的少量环境）时退回原生
        if (NATIVE_HLS_TYPES.some((type) => video.canPlayType(type) !== '')) {
          playNatively();
          return;
        }
        unsupported();
        return;
      }

      const instance = new Hls({ enableWorker: true, lowLatencyMode: false, maxAudioFramesDrift: 5 });
      hls = instance;
      instance.loadSource(url);
      instance.attachMedia(video);
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          instance.recoverMediaError();
          return;
        }
        instance.destroy();
        hls = null;
        video.src = url;
      });
    })
    .catch(() => {
      if (token !== loadToken) return;
      unsupported();
    });
}

function restoreResume(player: Artplayer): void {
  if (!props.resume || !props.resumeKey) return;
  const saved = Number(localStorage.getItem(resumeStorageKey()) ?? 0);
  const duration = player.duration;
  if (saved > 5 && Number.isFinite(duration) && saved < duration - 10) {
    player.currentTime = saved;
  }
}

function saveResume(player: Artplayer): void {
  if (!props.resume || !props.resumeKey) return;
  const now = Date.now();
  if (now - lastSaveAt < 5000) return;
  lastSaveAt = now;
  if (player.currentTime > 5) {
    localStorage.setItem(resumeStorageKey(), String(Math.floor(player.currentTime)));
  }
}

/**
 * 立刻把当前进度写进 localStorage（不受 5 秒节流限制）。
 * 换集前由父组件调用，保证「看了一半切走再切回来」能接上。
 */
function saveProgress(): void {
  if (!art || !props.resume || !props.resumeKey) return;
  lastSaveAt = Date.now();
  if (art.currentTime > 5) {
    localStorage.setItem(resumeStorageKey(), String(Math.floor(art.currentTime)));
  }
}

defineExpose({ saveProgress });

/**
 * 同步失败浮层：判据是内核自己的状态，不是事件。
 *
 * 只有 `video.error` 有值、且 `readyState` 停在「没数据可放」那几档才算真播不了。
 * 只看事件会被 iOS 残留的旧 code 骗（视频在放，屏幕上写着播放失败）；只看一次
 * 又分不清「刚起播就崩」和「崩完自己恢复了」。两个条件一起用，进出一共两条路径，
 * 既不需要记住「哪个地址报过错」，也不需要另找一个清除时机。
 */
function syncFailure(player: Artplayer): void {
  const { error, readyState } = player.video;
  // code 1 = 主动中断（换集、切线路时的 abort），不是真的失败，不能弹提示
  const broken =
    error !== null && error.code !== 1 && readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
  if (!broken) {
    // 有数据可放了就收浮层；只是残留的旧错误，压根没弹过，清一下也无害
    if (readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) failedText.value = '';
    return;
  }
  // 同一波错误只提示一次：内核会对同一个拉不到的地址反复报错，每次重弹就是闪屏
  if (failedText.value !== '') return;
  leaveFullscreen(player);
  failedText.value = NEUTRAL_FAILURE;
  emit('error');
}
/**
 * 失败时先退出全屏，否则浮层根本露不出来：
 * - 网页全屏时 Artplayer 会把容器改成 `position:fixed; inset:0; z-index:9999`，
 *   浮层的 `z-[130]` 压不过它；
 * - 原生全屏时浏览器只渲染全屏元素那一棵子树，浮层不在里面，等于看不见也点不到。
 * 两处失败都不该把用户锁在一个看不见提示的全屏画面里，所以一并退出。
 */
function leaveFullscreen(player: Artplayer): void {
  if (player.fullscreen) player.fullscreen = false;
  if (player.fullscreenWeb) player.fullscreenWeb = false;
}

function createPlayer(): void {
  // 重试/换集时先把浮层收掉，别让旧提示盖在正在重新加载的画面上
  failedText.value = '';
  const container = containerRef.value;
  if (!container || !directSrc.value) return;

  destroyPlayer();
  endedSent = false;

  const player = new Artplayer({
    container,
    url: directSrc.value,
    // 不能只靠 artplayer 从后缀推断：去广告代理的地址没有 `.m3u8` 后缀（见 inferType）
    type: inferType(directSrc.value),
    customType: { m3u8: playM3u8 },
    // 不放封面：加载时保持黑底，避免先闪一下影片海报（poster 也不再作为 prop 传入）
    autoplay: props.autoplay,
    theme: '#3b82f6',
    lang: 'zh-cn',
    volume: 0.7,
    playbackRate: true,
    aspectRatio: true,
    // 四个开关对应后台「播放设置」，默认值与 site.ts 的兜底保持一致
    screenshot: props.screenshot,
    fullscreen: props.fullscreen,
    fullscreenWeb: props.webfullscreen,
    pip: true,
    hotkey: true,
    setting: props.setting,
    autoSize: false,
    moreVideoAttr: { playsInline: true, preload: 'metadata' },
  });
  art = player;

  player.on('video:loadedmetadata', () => restoreResume(player));
  player.on('video:timeupdate', () => {
    saveResume(player);
    // 兜底：个别源站/内核到结尾时不派发 ended，这里按「离结尾不到 0.5 秒」判定一次
    if (endedSent) return;
    const video = player.video;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime >= 0.5) return;
    endedSent = true;
    if (props.resume && props.resumeKey) localStorage.removeItem(resumeStorageKey());
    emit('ended');
  });
  player.on('video:ended', () => {
    if (endedSent) return;
    endedSent = true;
    if (props.resume && props.resumeKey) localStorage.removeItem(resumeStorageKey());
    emit('ended');
  });
  // 出错和恢复都走同一个判定：内核状态说了算（见 syncFailure）
  player.on('video:error', () => syncFailure(player));
  player.on('video:canplay', () => syncFailure(player));
}
/**
 * 重新加载当前这一集。
 * 必须有：PlayView 的同集点击是 no-op（`applyEp` 遇到 `index === current` 直接 return），
 * 失败浮层又是不透明全屏盖层，没有这个按钮用户就只能换集才能继续看。
 */
function retry(): void {
  createPlayer();
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
    if (art && prev) {
      // 换集就地切换：同一个 ArtPlayer 实例换源，不销毁重建（避免黑一下）
      failedText.value = '';
      lastSaveAt = 0;
      endedSent = false;
      // 就地换源时 artplayer 用 `option.type` 判内核，换集地址可能变成代理地址（或反过来），
      // 所以每次换源前都要按新地址重算一次
      art.option.type = inferType(next);
      await art.switchUrl(next);
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
  <!--
    `isolate` 不是为了视觉，是把浮层的 `z-[130]` 锁在这个播放器内部：
    它会盖住顶栏（`SiteHeader.vue:81` 是 `sticky top-0 z-50`）。
    不隔离的话，页面滚到播放器贴住顶部时，那块不透明的失败浮层会画在导航上面。
    隔离后 130 只在播放器这个层叠上下文里有意义，对页面其它元素等于 0。
  -->
  <div class="player-box relative isolate h-full w-full bg-black">
    <iframe
      v-if="iframeSrc"
      :src="iframeSrc"
      class="h-full w-full border-0"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      referrerpolicy="no-referrer"
    ></iframe>
    <div v-else ref="containerRef" class="h-full w-full"></div>
    <!--
      `z-[130]` 是裸数值，理由是浮层必须盖住 Artplayer 自己的层：它内部的控件层是
      `.art-bottom:60`、`.art-loading:70`、`.art-notice:80`、`.art-settings:90`、
      `.art-info:100`、`.art-contextmenus:120`（打包在 artplayer.js 里的样式），
      而 `.art-video-player` 自身没建层叠上下文（`position:relative` + `z-index:auto`），
      所以不抬高层的活，遮罩会被控件盖住、按钮也点不到。Tailwind 没有 >50 的 z 刻度。
      抬高只在这个播放器里有效（外层容器用 `isolate` 做了层叠隔离），不会反过来
      压住顶部的 sticky 导航。
    -->
    <div
      v-if="failedText"
      class="absolute inset-0 z-[130] grid place-items-center overflow-y-auto bg-surface px-4 py-2 text-center text-small text-ink-2"
    >
      <div class="grid gap-3">
        <span>{{ failedText }}</span>
        <button
          type="button"
          class="mx-auto inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-line px-4 text-small text-ink-2 transition hover:border-primary-line hover:text-ink active:border-primary-line active:text-ink"
          @click="retry"
        >
          重新加载
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-box :deep(.art-video-player) {
  width: 100%;
  height: 100%;
}
</style>
