<script setup lang="ts">
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    src: string;
    /** 采集源的解析接口；非空时用 iframe 打开解析页 */
    parseUrl?: string;
    poster?: string;
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
    poster: '',
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

let art: Artplayer | null = null;
let hls: Hls | null = null;
let lastSaveAt = 0;

function resumeStorageKey(): string {
  return props.resumeKey ? RESUME_PREFIX + props.resumeKey : '';
}

function destroyPlayer(): void {
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
 */
function playM3u8(video: HTMLVideoElement, url: string, player: Artplayer): void {
  // 就地换集时同一个实例会被再次调用，先把上一条流的 hls 实例销毁，避免残留监听
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    return;
  }
  if (!Hls.isSupported()) {
    failed.value = true;
    player.notice.show = '该线路暂不支持在线播放';
    emit('error');
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

  const player = new Artplayer({
    container,
    url: props.src,
    type: 'auto',
    customType: { m3u8: playM3u8 },
    // ArtPlayer 会校验选项类型，poster 传 undefined 会直接抛错
    ...(props.poster ? { poster: props.poster } : {}),
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
  player.on('video:timeupdate', () => saveResume(player));
  player.on('video:ended', () => {
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
