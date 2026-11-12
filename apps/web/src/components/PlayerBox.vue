<script setup lang="ts">
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
    /** 断点续播的存储键，通常为 `${vodId}:${playId}` */
    resumeKey?: string;
  }>(),
  { parseUrl: '', poster: '', autoplay: false, resume: false, resumeKey: '' },
);

const emit = defineEmits<{ ended: []; error: [] }>();

const videoRef = ref<HTMLVideoElement | null>(null);
const failed = ref(false);

const iframeSrc = computed(() => {
  if (!props.parseUrl) return '';
  if (props.parseUrl.includes('{url}')) {
    return props.parseUrl.replace('{url}', encodeURIComponent(props.src));
  }
  return props.parseUrl + props.src;
});

let hls: Hls | null = null;
let lastSaveAt = 0;
const RESUME_PREFIX = 'lcm:resume:';

function resumeStorageKey(): string {
  return props.resumeKey ? RESUME_PREFIX + props.resumeKey : '';
}

function destroyHls(): void {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function tryPlay(video: HTMLVideoElement): void {
  if (!props.autoplay) return;
  const result = video.play();
  if (result) result.catch(() => undefined);
}

function attach(): void {
  failed.value = false;
  const video = videoRef.value;
  if (!video || !props.src) return;

  destroyHls();

  // iOS/Safari 原生支持 m3u8；走原生可避免发起带 Origin 的跨域请求（部分源站 WAF 会拦）。
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = props.src;
    tryPlay(video);
    return;
  }

  if (Hls.isSupported()) {
    const instance = new Hls({ enableWorker: true, lowLatencyMode: false, maxAudioFramesDrift: 5 });
    hls = instance;
    instance.loadSource(props.src);
    instance.attachMedia(video);
    instance.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        instance.recoverMediaError();
        return;
      }
      // 回退到原生内核，再试一次
      destroyHls();
      video.src = props.src;
    });
    tryPlay(video);
    return;
  }

  video.src = props.src;
  tryPlay(video);
}

function onLoadedMetadata(): void {
  const video = videoRef.value;
  if (!video) return;

  if (props.resume && props.resumeKey) {
    const saved = Number(localStorage.getItem(resumeStorageKey()) ?? 0);
    if (saved > 5 && Number.isFinite(video.duration) && saved < video.duration - 10) {
      video.currentTime = saved;
    }
  }
  if (props.autoplay) tryPlay(video);
}

function onTimeUpdate(): void {
  const video = videoRef.value;
  if (!video || !props.resume || !props.resumeKey) return;
  const now = Date.now();
  if (now - lastSaveAt < 5000) return;
  lastSaveAt = now;
  if (video.currentTime > 5) {
    localStorage.setItem(resumeStorageKey(), String(Math.floor(video.currentTime)));
  }
}

function onEnded(): void {
  if (props.resume && props.resumeKey) localStorage.removeItem(resumeStorageKey());
  emit('ended');
}

function onVideoError(): void {
  failed.value = true;
  emit('error');
}

watch(
  () => [props.src, props.parseUrl],
  async () => {
    await nextTick();
    if (!iframeSrc.value) attach();
  },
  { flush: 'post' },
);

onMounted(() => {
  if (!iframeSrc.value) attach();
});

onBeforeUnmount(destroyHls);
</script>

<template>
  <div class="player-shell">
    <iframe
      v-if="iframeSrc"
      :src="iframeSrc"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      referrerpolicy="no-referrer"
    ></iframe>
    <video
      v-else
      ref="videoRef"
      controls
      playsinline
      preload="metadata"
      :poster="poster || undefined"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @error="onVideoError"
    ></video>
    <div v-if="failed" class="player-fallback">该线路暂不支持在线播放</div>
  </div>
</template>
