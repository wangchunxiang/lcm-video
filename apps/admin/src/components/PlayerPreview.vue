<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ player: string }>();

const accent = computed(() => (props.player === 'artplayer' ? '#409eff' : '#ff5c8a'));
const playerName = computed(() => (props.player === 'artplayer' ? 'ArtPlayer' : 'DPlayer'));
</script>

<template>
  <div class="preview">
    <div class="stage">
      <div class="title">示例影片 · 第 01 集</div>

      <div class="center-play">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </div>

      <div class="bar">
        <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
        <div class="track">
          <div class="played" :style="{ width: '38%', background: accent }" />
          <div class="knob" :style="{ left: '38%', background: accent }" />
        </div>
        <div class="time">12:04 / 45:30</div>
        <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="#fff">
          <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
        </svg>
        <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="#fff">
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14z" />
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
  max-width: 420px;
  margin-bottom: 16px;
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
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.center-play {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.35);
}
.center-play svg {
  margin-left: 2px;
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
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
