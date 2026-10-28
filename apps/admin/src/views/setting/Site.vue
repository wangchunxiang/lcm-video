<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../../api/client.ts';
import ImageUpload from '../../components/ImageUpload.vue';

interface FieldItem extends SettingField {
  value: string;
}

interface ThemeItem {
  name: string;
  title: string;
  active: boolean;
}

interface Row {
  key: string;
  label: string;
  kind: 'text' | 'image' | 'select' | 'textarea';
  hint?: string;
  /** 长文本占满两列 */
  wide?: boolean;
}

/** 站点设置页自己的字段，改这个页面不会影响其他设置页 */
const FIELDS: Row[] = [
  { key: 'site_name', label: '站点名称', kind: 'text' },
  { key: 'site_subtitle', label: '站点副标题', kind: 'text' },
  { key: 'site_icp', label: '备案号', kind: 'text' },
  { key: 'site_theme', label: '当前模板', kind: 'select' },
  { key: 'site_logo', label: '站点 LOGO', kind: 'image', hint: '填写图片地址，或直接上传' },
  { key: 'site_favicon', label: '站点图标', kind: 'image', hint: '浏览器标签页上的小图标' },
  { key: 'site_keywords', label: 'SEO 关键词', kind: 'textarea', wide: true, hint: '多个关键词用英文逗号分隔' },
  { key: 'site_description', label: 'SEO 描述', kind: 'textarea', wide: true },
  { key: 'site_disclaimer', label: '免责声明', kind: 'textarea', wide: true, hint: '显示在前台页脚' },
  { key: 'site_stats_code', label: '统计代码', kind: 'textarea', wide: true, hint: '原样输出到前台页面底部' },
  { key: 'list_page_size', label: '列表每页条数', kind: 'text', hint: '首页与分类页每页影片数，建议 24' },
  { key: 'collect_log_keep_days', label: '采集记录保留天数', kind: 'text', hint: '调度器每天清理一次' },
  { key: 'upload_max_mb', label: '单文件上传上限（MB）', kind: 'text' },
];

const KEYS = FIELDS.map((field) => field.key);

const form = reactive<Record<string, string>>({
  site_name: '',
  site_subtitle: '',
  site_icp: '',
  site_theme: 'default',
  site_logo: '',
  site_favicon: '',
  site_keywords: '',
  site_description: '',
  site_disclaimer: '',
  site_stats_code: '',
  list_page_size: '24',
  collect_log_keep_days: '30',
  upload_max_mb: '2',
});

const themes = ref<ThemeItem[]>([]);
const loading = ref(false);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: FieldItem[]; themes: ThemeItem[] }>('/settings');
    themes.value = data.themes ?? [];
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
      <div class="grid">
        <div v-for="row in FIELDS" :key="row.key" class="item" :class="{ wide: row.wide }">
          <div class="item-label">
            <span>{{ row.label }}</span>
            <el-tooltip v-if="row.hint" :content="row.hint" placement="top">
              <el-icon class="item-tip"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>

          <ImageUpload v-if="row.kind === 'image'" v-model="form[row.key]" />
          <el-select v-else-if="row.kind === 'select'" v-model="form[row.key]">
            <el-option v-for="theme in themes" :key="theme.name" :label="theme.title" :value="theme.name" />
          </el-select>
          <el-input
            v-else-if="row.kind === 'textarea'"
            v-model="form[row.key]"
            type="textarea"
            :rows="3"
            resize="vertical"
          />
          <el-input v-else v-model="form[row.key]" />
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
  padding: 16px 20px 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 40px;
  padding: 8px 0 4px;
}
.item.wide {
  grid-column: 1 / -1;
}
.item-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--el-text-color-regular);
}
.item-tip {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  cursor: help;
}
.grid :deep(.image-upload) {
  max-width: none;
}
.card-foot {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding: 14px 0 16px;
  border-top: 1px solid var(--el-border-color);
}
</style>
