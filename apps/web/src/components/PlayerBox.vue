<script setup lang="ts">
import Artplayer from 'artplayer';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    src: string;
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

const containerRef = ref<HTMLDivElement | null>(null);
const failed = ref(false);

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
  on(event: string, listener: (event: string, data: { fatal?: boolean; type?: string }) => void): void;
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
 * 于是每个非 Safari 浏览器都会卡在「该线路暂不支持在线播放」。
 * iPhone/iPad 没有 MSE，hls.js 起不来，直接交给原生内核（也省掉 400KB 的下载）。
 */
function playM3u8(video: HTMLVideoElement, url: string, player: Artplayer): void {
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
    failed.value = true;
    player.notice.show = '该线路暂不支持在线播放';
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

function createPlayer(): void {
  failed.value = false;
  const container = containerRef.value;
  if (!container || !props.src) return;

  destroyPlayer();
  endedSent = false;

  const player = new Artplayer({
    container,
    url: props.src,
    // 必须是空串：artplayer 的 url setter 是 `option.type || 由后缀推断`，写成 'auto'
    // 会被当成一个叫 auto 的类型名，customType 直接跳过、video.src 被裸赋值 ——
    // 也就是 hls.js 永远加载不到，非 Safari 一律报「不支持」
    type: '',
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
  player.on('video:error', () => {
    failed.value = true;
    emit('error');
  });
}

watch(
  () => props.src,
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
      failed.value = false;
      lastSaveAt = 0;
      endedSent = false;
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
    <div
      v-if="failed"
      class="absolute inset-0 grid place-items-center bg-[#0f172a] text-[13px] text-[#c9d1de]"
    >
      该线路暂不支持在线播放
    </div>
  </div>
</template>

<style scoped>
.player-box :deep(.art-video-player) {
  width: 100%;
  height: 100%;
}
</style>
