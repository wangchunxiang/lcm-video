<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
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
  suffix?: string;
}

/** 播放设置页自己的字段，改这个页面不会影响其他设置页 */
const FIELDS: Row[] = [
  { key: 'player_autoplay', label: '自动播放', kind: 'switch', hint: '进入播放页自动开始' },
  { key: 'player_autonext', label: '自动连播', kind: 'switch', hint: '播完自动跳下一集' },
  { key: 'player_resume', label: '进度记忆', kind: 'switch', hint: '记住上次看到的位置' },
  { key: 'player_volume', label: '默认音量', kind: 'number', hint: '0 到 100', suffix: '' },
  { key: 'player_muted', label: '静音起播', kind: 'switch', hint: '进入播放页时静音' },
  { key: 'player_hotkey', label: '键盘快捷键', kind: 'switch', hint: '空格暂停、方向键快进' },
  { key: 'player_screenshot', label: '截图按钮', kind: 'switch', hint: '控制栏显示截图按钮' },
  { key: 'player_pip', label: '画中画', kind: 'switch', hint: '控制栏显示画中画按钮' },
  { key: 'player_webfullscreen', label: '网页全屏', kind: 'switch', hint: '控制栏显示网页全屏按钮' },
  { key: 'player_setting', label: '设置面板', kind: 'switch', hint: '控制栏显示设置面板' },
  { key: 'player_loop', label: '循环播放', kind: 'switch', hint: '播完自动重播' },
];

const KEYS = FIELDS.map((field) => field.key);

const form = reactive<Record<string, string>>({
  player_autoplay: '0',
  player_autonext: '1',
  player_resume: '1',
  player_volume: '80',
  player_muted: '0',
  player_hotkey: '1',
  player_screenshot: '1',
  player_pip: '1',
  player_webfullscreen: '0',
  player_setting: '1',
  player_loop: '0',
});

const loading = ref(false);
const saving = ref(false);

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
    <el-card shadow="never" class="group-card">
      <div class="body">
        <div v-for="row in FIELDS" :key="row.key" class="field">
          <label class="field-label">{{ row.label }}</label>
          <div class="field-ctrl">
            <el-switch
              v-if="row.kind === 'switch'"
              v-model="form[row.key]"
              active-value="1"
              inactive-value="0"
            />
            <el-input v-else v-model="form[row.key]" style="width: 220px">
              <template v-if="row.suffix" #append>{{ row.suffix }}</template>
            </el-input>
            <div v-if="row.hint" class="field-hint">{{ row.hint }}</div>
          </div>
        </div>
      </div>

      <div class="card-foot">
        <el-button @click="load">重置</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}
.group-card :deep(.el-card__body) {
  padding: 16px 24px 0;
}
.body {
  max-width: 860px;
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0;
}
.field-label {
  flex: none;
  width: 104px;
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
  padding: 14px 0 16px 116px;
  border-top: 1px solid var(--el-border-color);
}
</style>
