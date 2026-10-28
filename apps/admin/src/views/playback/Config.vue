<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';

interface FieldItem extends SettingField {
  value: string;
}

interface Section {
  title: string;
  rows: { key: string; label: string; hint?: string; kind: 'switch' | 'text' }[];
}

/** 播放设置页自己的字段，改这个页面不会影响其他设置页 */
const SECTIONS: Section[] = [
  {
    title: '播放行为',
    rows: [
      { key: 'player_autoplay', label: '自动播放', hint: '进入播放页自动开始', kind: 'switch' },
      { key: 'player_autonext', label: '自动连播', hint: '播完自动跳下一集', kind: 'switch' },
      { key: 'player_resume', label: '进度记忆', hint: '记住上次看到的位置', kind: 'switch' },
    ],
  },
  {
    title: '画面与声音',
    rows: [
      { key: 'player_volume', label: '默认音量', hint: '0 - 100', kind: 'text' },
      { key: 'player_muted', label: '静音起播', hint: '进来先静音', kind: 'switch' },
      { key: 'player_pip', label: '画中画', hint: '缩成小窗边看边逛', kind: 'switch' },
      { key: 'player_webfullscreen', label: '网页全屏', hint: '撑满窗口，不隐藏标签栏', kind: 'switch' },
    ],
  },
  {
    title: '控制栏',
    rows: [
      { key: 'player_hotkey', label: '键盘快捷键', hint: '空格暂停，方向键快进快退', kind: 'switch' },
      { key: 'player_screenshot', label: '截图按钮', hint: '控制栏显示截图按钮', kind: 'switch' },
      { key: 'player_setting', label: '设置面板', hint: '齿轮按钮，含倍速选项', kind: 'switch' },
      { key: 'player_loop', label: '循环播放', hint: '单集循环，连播优先', kind: 'switch' },
    ],
  },
];

const KEYS = SECTIONS.flatMap((section) => section.rows.map((row) => row.key));

const form = reactive<Record<string, string>>({
  player_autoplay: '0',
  player_autonext: '1',
  player_resume: '1',
  player_volume: '80',
  player_muted: '0',
  player_pip: '1',
  player_webfullscreen: '0',
  player_hotkey: '1',
  player_screenshot: '1',
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
      <div class="list">
        <template v-for="(section, sectionIndex) in SECTIONS" :key="section.title">
          <div v-if="sectionIndex > 0" class="section-gap"></div>

          <div v-for="row in section.rows" :key="row.key" class="row">
            <div class="row-main">
              <span class="row-title">{{ row.label }}</span>
              <el-tooltip v-if="row.hint" :content="row.hint" placement="top">
                <el-icon class="row-tip"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="row-ctrl">
              <el-switch v-if="row.kind === 'switch'" v-model="form[row.key]" active-value="1" inactive-value="0" />
              <el-input v-else v-model="form[row.key]" style="width: 160px" />
            </div>
          </div>
        </template>
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
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.group-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.group-card :deep(.el-card__body) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  padding: 4px 20px 0;
}
.list {
  flex: 1 1 auto;
  width: 100%;
  max-width: 760px;
}
.section-gap {
  height: 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 44px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.row:last-child {
  border-bottom: none;
}
.row-main {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
}
.row-tip {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  cursor: help;
}
.row-ctrl {
  margin-left: auto;
  flex: none;
  display: flex;
  align-items: center;
}
.card-foot {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  max-width: 760px;
  gap: 10px;
  margin-top: auto;
  padding: 14px 0 16px;
  border-top: 1px solid var(--el-border-color);
}
</style>
