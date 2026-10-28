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
  kind: 'switch' | 'number';
  hint?: string;
}

/** 播放设置页自己的字段，改这个页面不会影响其他设置页 */
const BEHAVIOR: Row[] = [
  { key: 'player_autoplay', label: '自动播放', kind: 'switch', hint: '进入播放页自动开始' },
  { key: 'player_autonext', label: '自动连播', kind: 'switch', hint: '播完自动跳下一集' },
  { key: 'player_resume', label: '进度记忆', kind: 'switch', hint: '记住上次看到的位置' },
  { key: 'player_loop', label: '循环播放', kind: 'switch', hint: '单集循环播放' },
  { key: 'player_muted', label: '静音起播', kind: 'switch', hint: '进来先静音' },
  { key: 'player_volume', label: '默认音量', kind: 'number', hint: '0 到 100' },
];

const CONTROLS: Row[] = [
  { key: 'player_hotkey', label: '键盘快捷键', kind: 'switch', hint: '空格暂停，方向键快进快退' },
  { key: 'player_screenshot', label: '截图', kind: 'switch', hint: '控制栏按钮' },
  { key: 'player_pip', label: '画中画', kind: 'switch', hint: '控制栏按钮' },
  { key: 'player_fullscreen', label: '全屏', kind: 'switch', hint: '控制栏按钮' },
  { key: 'player_webfullscreen', label: '网页全屏', kind: 'switch', hint: '控制栏按钮，不隐藏标签栏' },
  { key: 'player_setting', label: '设置面板', kind: 'switch', hint: '控制栏齿轮，下面三项在面板里' },
  { key: 'player_mini_progress', label: '迷你进度条', kind: 'switch', hint: '页面滚动后仍显示进度' },
  { key: 'player_auto_mini', label: '迷你播放', kind: 'switch', hint: '滚出视野后缩成小窗' },
];

const PANEL: Row[] = [
  { key: 'player_playback_rate', label: '倍速播放', kind: 'switch', hint: '设置面板内，0.5 到 2 倍' },
  { key: 'player_aspect_ratio', label: '画面比例', kind: 'switch', hint: '设置面板内，16:9、4:3 等' },
  { key: 'player_flip', label: '镜像翻转', kind: 'switch', hint: '设置面板内，左右翻转画面' },
];

const ROWS = [...BEHAVIOR, ...CONTROLS, ...PANEL];
const KEYS = ROWS.map((row) => row.key);
const PANEL_KEYS = PANEL.map((row) => row.key);

const form = reactive<Record<string, string>>({
  player_autoplay: '0',
  player_autonext: '1',
  player_resume: '1',
  player_loop: '0',
  player_muted: '0',
  player_volume: '80',
  player_hotkey: '1',
  player_screenshot: '1',
  player_pip: '1',
  player_fullscreen: '1',
  player_webfullscreen: '0',
  player_setting: '1',
  player_mini_progress: '1',
  player_auto_mini: '0',
  player_playback_rate: '1',
  player_aspect_ratio: '1',
  player_flip: '0',
});

const loading = ref(false);
const saving = ref(false);

const on = (key: string) => form[key] === '1';
const hasPanel = computed(() => on('player_setting'));
const panelItems = computed(() => PANEL.filter((row) => on(row.key)).map((row) => row.label));
const behaviorTags = computed(() => [
  { label: '自动播放', active: on('player_autoplay') },
  { label: '自动连播', active: on('player_autonext') },
  { label: '进度记忆', active: on('player_resume') },
  { label: '循环', active: on('player_loop') },
  { label: '静音起播', active: on('player_muted') },
  { label: '快捷键', active: on('player_hotkey') },
  { label: `音量 ${form.player_volume || 0}`, active: true },
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

async function save() {
  const values: Record<string, string> = {};
  for (const key of KEYS) values[key] = String(form[key] ?? '');

  saving.value = true;
  try {
    await api.put('/settings', { values });
    ElMessage.success('保存成功');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="cols">
      <el-card shadow="never" class="preview-card">
        <template #header>
          <span>预览</span>
          <span class="preview-tip">示意控制栏，效果以播放器为准</span>
        </template>

        <div class="stage">
          <div class="poster">
            <el-icon :size="44"><VideoPlay /></el-icon>
          </div>

          <div v-if="hasPanel" class="panel">
            <div v-if="!panelItems.length" class="panel-empty">面板里没有项</div>
            <div v-for="item in panelItems" :key="item" class="panel-item">
              <span>{{ item }}</span>
              <el-icon :size="12"><ArrowRight /></el-icon>
            </div>
          </div>

          <div v-if="on('player_auto_mini')" class="mini-window">
            <span>滚出视野后缩成小窗</span>
          </div>

          <div class="bar">
            <el-icon :size="16"><VideoPlay /></el-icon>
            <div class="progress"><div class="progress-done" /></div>
            <span class="time">00:12 / 01:30</span>
            <el-icon :size="15"><Mute /></el-icon>
            <el-icon v-if="on('player_screenshot')" :size="15"><Camera /></el-icon>
            <el-icon v-if="on('player_pip')" :size="15"><CopyDocument /></el-icon>
            <el-icon v-if="on('player_fullscreen')" :size="15"><FullScreen /></el-icon>
            <el-icon v-if="on('player_webfullscreen')" :size="15"><Monitor /></el-icon>
            <el-icon v-if="hasPanel" :size="15" class="gear"><Setting /></el-icon>
          </div>

          <div v-if="on('player_mini_progress')" class="mini-progress">
            <div class="mini-progress-done" />
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
      </el-card>
      <el-card shadow="never" class="group-card">
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
                v-if="row.kind === 'switch'"
                v-model="form[row.key]"
                active-value="1"
                inactive-value="0"
                :disabled="PANEL_KEYS.includes(row.key) && !hasPanel"
              />
              <el-input v-else v-model="form[row.key]" style="width: 120px" />
              <div class="field-hint">
                {{ PANEL_KEYS.includes(row.key) && !hasPanel ? '需先开启「设置面板」' : row.hint }}
              </div>
            </div>
          </div>
        </div>

        <div class="card-foot">
          <el-button @click="load">重置</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </el-card>

    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}
.cols {
  display: grid;
  grid-template-columns: 480px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 28px;
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0;
}
.field.disabled .field-label {
  color: var(--el-text-color-placeholder);
}
.field-label {
  flex: none;
  width: 96px;
  text-align: right;
  line-height: 32px;
  color: var(--el-text-color-regular);
}
.field-ctrl {
  flex: 1;
  min-width: 0;
}
.field-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.card-foot {
  display: flex;
  gap: 10px;
  margin: 16px 0 0;
  padding: 14px 0 0 108px;
  border-top: 1px solid var(--el-border-color);
}

.preview-card {
  position: sticky;
  top: 12px;
}
.preview-tip {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
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
  margin-top: 12px;
}
</style>
