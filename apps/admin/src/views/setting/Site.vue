<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client.ts';

interface Row {
  key: string;
  label: string;
  kind: 'text' | 'select' | 'textarea';
  hint?: string;
}

/** 站点设置页自己的字段，改这个页面不会影响其他设置页。 */
const FIELDS: Row[] = [
  { key: 'site_name', label: '站点名称', kind: 'text' },
  { key: 'site_subtitle', label: '站点副标题', kind: 'text' },
  { key: 'site_disclaimer', label: '免责声明', kind: 'textarea', hint: '显示在前台页脚' },
  { key: 'site_stats_code', label: '统计代码', kind: 'textarea', hint: '原样输出到前台页面底部' },
  { key: 'list_page_size', label: '列表每页条数', kind: 'text', hint: '建议保持 24（三行八列）' },
  { key: 'collect_log_keep_days', label: '日志保留天数', kind: 'text', hint: '超期自动清理' },
];

const KEYS = FIELDS.map((field) => field.key);

const form = reactive<Record<string, string>>({
  site_name: '',
  site_subtitle: '',
  site_disclaimer: '',
  site_stats_code: '',
  list_page_size: '24',
  collect_log_keep_days: '30',
});

const loading = ref(false);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    // v3 的 map 接口一次返回全部配置键值，页面只取自己关心的几个
    const data = await api.post<Record<string, string>>('/setting/map');
    for (const key of KEYS) {
      const value = data[key];
      if (value !== undefined) form[key] = value;
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const entries = KEYS.map((key) => ({ key, value: String(form[key] ?? '') }));

  saving.value = true;
  try {
    await api.post('/setting/save-many', { entries });
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
            <el-input
              v-if="row.kind === 'textarea'"
              v-model="form[row.key]"
              type="textarea"
              :rows="3"
              resize="vertical"
              style="max-width: 560px"
            />
            <el-input v-else v-model="form[row.key]" style="width: 220px" />

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
