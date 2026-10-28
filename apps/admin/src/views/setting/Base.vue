<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';

interface FieldItem extends SettingField {
  value: string;
}

/** 基础设置页自己的字段，改这个页面不会影响其他设置页 */
const FIELDS = [
  { key: 'list_page_size', label: '列表每页条数', hint: '前台首页与分类页每页显示的影片数量，建议保持 24（三行八列）。' },
  { key: 'collect_log_keep_days', label: '采集记录保留天数', hint: '调度器每天清理一次超出天数的采集记录。' },
  { key: 'upload_max_mb', label: '单文件上传上限（MB）', hint: '' },
];

const form = reactive<Record<string, string>>({
  list_page_size: '24',
  collect_log_keep_days: '30',
  upload_max_mb: '2',
});

const loading = ref(false);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: FieldItem[] }>('/settings');
    for (const item of data.items) {
      if (item.key in form) form[item.key] = item.value ?? '';
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const values: Record<string, string> = {};
  for (const field of FIELDS) values[field.key] = String(form[field.key] ?? '');

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
        <div v-for="field in FIELDS" :key="field.key" class="row">
          <div class="row-main">
            <span class="row-title">{{ field.label }}</span>
            <el-tooltip v-if="field.hint" :content="field.hint" placement="top">
              <el-icon class="row-tip"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <div class="row-ctrl">
            <el-input v-model="form[field.key]" style="width: 160px" />
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
