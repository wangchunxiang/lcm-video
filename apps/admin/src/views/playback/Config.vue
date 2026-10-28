<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';

interface FieldItem extends SettingField {
  value: string;
}

interface Row {
  key: string;
  label: string;
  hint?: string;
}

/** 播放设置页自己的字段，改这个页面不会影响其他设置页 */
const BEHAVIOR: Row[] = [
  { key: 'player_autoplay', label: '自动播放', hint: '进入播放页自动开始' },
  { key: 'player_autonext', label: '自动连播', hint: '播完自动跳下一集' },
  { key: 'player_resume', label: '进度记忆', hint: '记住上次看到的位置' },
];

const CONTROLS: Row[] = [
  { key: 'player_screenshot', label: '截图', hint: '控制栏按钮' },
  { key: 'player_fullscreen', label: '全屏', hint: '控制栏按钮' },
  { key: 'player_webfullscreen', label: '网页全屏', hint: '控制栏按钮' },
  { key: 'player_setting', label: '设置面板', hint: '控制栏齿轮按钮' },
];

/** 设置面板内暂时没有可配项，播放器自带「信息 / 版本」 */
const PANEL: Row[] = [];

const ROWS = [...BEHAVIOR, ...CONTROLS, ...PANEL];
const KEYS = ROWS.map((row) => row.key);
const PANEL_KEYS = PANEL.map((row) => row.key);

const form = reactive<Record<string, string>>({
  player_autoplay: '0',
  player_autonext: '1',
  player_resume: '1',
  player_screenshot: '1',
  player_fullscreen: '1',
  player_webfullscreen: '0',
  player_setting: '1',
});

const loading = ref(false);
const savingKey = ref('');

const on = (key: string) => form[key] === '1';
const hasPanel = computed(() => on('player_setting'));
const panelItems = computed(() => [
  ...PANEL.filter((row) => on(row.key)).map((row) => row.label),
  '信息',
  '版本',
]);
const behaviorTags = computed(() => [
  { label: '自动播放', active: on('player_autoplay') },
  { label: '自动连播', active: on('player_autonext') },
  { label: '进度记忆', active: on('player_resume') },
]);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: FieldItem[] }>('/settings');
    for (const item of data.items) {
      if (KEYS.includes(item.key)) form[item.key] = item.value ?? '';
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

/** 改动即存，不设保存按钮 */
async function saveKey(key: string) {
  savingKey.value = key;
  try {
    await api.put('/settings', { values: { [key]: String(form[key] ?? '') } });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
    await load();
  } finally {
    savingKey.value = '';
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div v-loading="loading" class="page">
    <el-card shadow="never" class="group-card">
      <div class="layout">
        <div class="stage-col">
          <div class="stage">
            <div class="poster">
              <el-icon :size="52"><VideoPlay /></el-icon>
            </div>

            <div v-if="hasPanel" class="panel">
              <div v-for="item in panelItems" :key="item" class="panel-item">
                <span>{{ item }}</span>
                <el-icon :size="12"><ArrowRight /></el-icon>
              </div>
            </div>

            <div class="bar">
              <el-icon :size="18"><VideoPlay /></el-icon>
              <div class="progress"><div class="progress-done" /></div>
              <span class="time">00:12 / 01:30</span>
              <el-icon :size="16"><Mute /></el-icon>
              <el-icon v-if="on('player_screenshot')" :size="16"><Camera /></el-icon>
              <el-icon v-if="on('player_fullscreen')" :size="16"><FullScreen /></el-icon>
              <el-icon v-if="on('player_webfullscreen')" :size="16"><Monitor /></el-icon>
              <el-icon v-if="hasPanel" :size="16" class="gear"><Setting /></el-icon>
            </div>

          </div>

          <div class="behaviors">
            <el-tag
              v-for="tag in behaviorTags"
              :key="tag.label"
              size="small"
              :type="tag.active ? 'primary' : 'info'"
              :effect="tag.active ? 'light' : 'plain'"
            >
              {{ tag.label }}
            </el-tag>
          </div>
        </div>

        <div class="grid">
          <div
            v-for="row in ROWS"
            :key="row.key"
            class="field"
            :class="{ disabled: PANEL_KEYS.includes(row.key) && !hasPanel }"
          >
            <label class="field-label">{{ row.label }}</label>
            <div class="field-ctrl">
              <el-switch
                v-model="form[row.key]"
                active-value="1"
                inactive-value="0"
                :loading="savingKey === row.key"
                :disabled="PANEL_KEYS.includes(row.key) && !hasPanel"
                @change="saveKey(row.key)"
              />
              <div class="field-hint">
                {{ PANEL_KEYS.includes(row.key) && !hasPanel ? '需先开启「设置面板」' : row.hint }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
}
.group-card {
  height: 100%;
}
.group-card :deep(.el-card__body) {
  height: 100%;
  box-sizing: border-box;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 32px;
  height: 100%;
}
.stage-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 18px;
  align-content: start;
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}
.field.disabled .field-label {
  color: var(--el-text-color-placeholder);
}
.field-label {
  flex: none;
  width: 74px;
  text-align: right;
  line-height: 28px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.field-ctrl {
  flex: 1;
  min-width: 0;
}
.field-hint {
  margin-top: 1px;
  font-size: 12px;
  line-height: 16px;
  color: var(--el-text-color-secondary);
}

.stage {
  position: relative;
  padding-top: 56.25%;
  border-radius: 6px;
  overflow: hidden;
  background: #111;
}
.poster {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #1f2d3d, #3a4a5c 60%, #1f2d3d);
  color: rgba(255, 255, 255, 0.45);
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
}
.progress {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
}
.progress-done {
  width: 18%;
  height: 100%;
  border-radius: 2px;
  background: var(--el-color-primary);
}
.time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
}
.gear {
  color: var(--el-color-primary);
}
.mini-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.2);
}
.mini-progress-done {
  width: 18%;
  height: 100%;
  background: var(--el-color-primary);
}
.panel {
  position: absolute;
  right: 10px;
  bottom: 42px;
  min-width: 150px;
  padding: 4px 0;
  border-radius: 4px;
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  font-size: 12px;
}
.panel-empty {
  padding: 6px 10px;
  color: rgba(255, 255, 255, 0.6);
}
.panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
}
.mini-window {
  position: absolute;
  right: 12px;
  bottom: 52px;
  width: 128px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.75);
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
}
.behaviors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
</style>
