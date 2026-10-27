<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ options: Record<string, string> }>();

const on = (key: string) => props.options[key] === '1';
const volume = computed(() => props.options.player_volume || '80');
</script>

<template>
  <div class="preview">
    <div class="canvas">
      <div class="title">示例影片 · 第 01 集</div>
      <div class="center">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </div>
      <div class="bar">
        <svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
        <div class="track"><div class="played" /></div>
        <span class="time">00:00 / 45:30</span>
        <svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
        <svg v-if="on('player_screenshot')" class="ico" viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M20 5h-3.2l-1.4-2H8.6L7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" /></svg>
        <svg v-if="on('player_pip')" class="ico" viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M19 11h-8v6h8v-6zm4 8V5H1v14h22zm-2-2H3V7h18v10z" /></svg>
        <svg v-if="on('player_webfullscreen')" class="ico" viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
        <svg v-if="on('player_setting')" class="ico" viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1L14.4 2.4a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4L9.1 5a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.2.4.5.4h4c.2 0 .4-.2.5-.4l.4-2.6c.6-.2 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" /></svg>
      </div>
      <div class="badge">{{ on('player_muted') ? '静音' : '音量 ' + volume + '%' }}</div>
    </div>
  </div>
</template>

<style scoped>
.preview {
  width: 100%;
}
.canvas {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: radial-gradient(circle at 50% 35%, #23262d 0%, #0d0f12 70%);
}
.title {
  position: absolute;
  top: 10px;
  left: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 46px;
  height: 46px;
  margin: -23px 0 0 -23px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.35);
}
.center svg {
  margin-left: 2px;
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
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
  inset: 0 auto 0 0;
  width: 32%;
  border-radius: 2px;
  background: var(--el-color-primary);
}
.time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.86);
  font-variant-numeric: tabular-nums;
}
.ico {
  flex: none;
  opacity: 0.9;
}
.badge {
  position: absolute;
  top: 10px;
  right: 12px;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.4);
}
</style>
