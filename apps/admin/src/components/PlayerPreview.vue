<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ player: string; options: Record<string, string> }>();

const accent = computed(() => (props.player === 'artplayer' ? '#409eff' : '#ff5c8a'));
const playerName = computed(() => (props.player === 'artplayer' ? 'ArtPlayer' : 'DPlayer'));

function on(key: string, fallback = true): boolean {
  const value = props.options[key];
  if (value === undefined || value === '') return fallback;
  return value === '1';
}

const showScreenshot = computed(() => on('player_screenshot'));
const showPip = computed(() => on('player_pip'));
const showSetting = computed(() => on('player_setting'));
const showWebFullscreen = computed(() => on('player_webfullscreen', false) && props.player === 'artplayer');
const muted = computed(() => on('player_muted', false));
const looping = computed(() => on('player_loop', false) && !on('player_autonext'));
</script>

<template>
  <div class="preview">
    <div class="stage">
      <div class="title">
        示例影片 · 第 01 集
        <span v-if="looping" class="badge">循环</span>
      </div>

      <div class="center-play">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </div>

      <div class="bar">
        <svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
        <div class="track">
          <div class="played" :style="{ width: '38%', background: accent }" />
          <div class="knob" :style="{ left: '38%', background: accent }" />
        </div>
        <div class="time">12:04 / 45:30</div>

        <svg v-if="muted" class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v2.2l2.4 2.4c.1-.2.1-.4.1-.6zM3 4.3 4.3 3 20 18.7 18.7 20l-3.2-3.2A8.9 8.9 0 0 0 19 12a7 7 0 0 0-5.5-6.8v2.1A4.5 4.5 0 0 1 16.5 12c0 .6-.1 1.1-.3 1.6L14 11.4V6L9.7 10.3 3 4.3zM12 4 9 7h3V4zM3 10v4h4l5 4v-2.6L7.6 11H3z" />
        </svg>
        <svg v-else class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
        </svg>

        <svg v-if="showScreenshot" class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M20 5h-3.2l-1.4-2H8.6L7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        </svg>

        <svg v-if="showPip" class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M19 11h-8v6h8v-6zm4 8V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2zm-2 .02H3V5h18v14z" />
        </svg>

        <svg v-if="showSetting" class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1L14.4 2.4a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4L9.1 5a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.2.4.5.4h4c.2 0 .4-.2.5-.4l.4-2.6c.6-.2 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
        </svg>

        <svg v-if="showWebFullscreen" class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 0h2v7h-7v-2h5v-5z" />
        </svg>

        <svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="#fff">
          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
        </svg>
      </div>
    </div>

    <div class="caption">
      预览 · <span class="name">{{ playerName }}</span>
    </div>
  </div>
</template>

<style scoped>
.preview {
  width: 100%;
  max-width: 560px;
  margin-bottom: 18px;
}
.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: radial-gradient(circle at 50% 35%, #23262d 0%, #0d0f12 70%);
  border-radius: 4px;
  overflow: hidden;
}
.title {
  position: absolute;
  top: 12px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.badge {
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.18);
}
.center-play {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 62px;
  height: 62px;
  margin: -31px 0 0 -31px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.35);
}
.center-play svg {
  margin-left: 3px;
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.78));
}
.track {
  position: relative;
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.32);
}
.played {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 2px;
}
.knob {
  position: absolute;
  top: -3px;
  width: 9px;
  height: 9px;
  margin-left: -4px;
  border-radius: 50%;
}
.time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.86);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.icon {
  opacity: 0.9;
  flex: none;
}
.caption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.name {
  color: var(--el-text-color-regular);
}
</style>
