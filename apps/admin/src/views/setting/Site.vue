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
  section: string;
  kind: 'text' | 'image' | 'select' | 'textarea';
  hint?: string;
}

/** 站点设置页自己的字段，改这个页面不会影响其他设置页 */
const FIELDS: Row[] = [
  { key: 'site_name', label: '站点名称', section: '站点信息', kind: 'text' },
  { key: 'site_subtitle', label: '站点副标题', section: '站点信息', kind: 'text' },
  { key: 'site_icp', label: '备案号', section: '站点信息', kind: 'text', hint: '显示在前台页脚' },
  { key: 'site_logo', label: '站点 LOGO', section: '品牌与外观', kind: 'image', hint: '留空则显示站名文字' },
  { key: 'site_favicon', label: '站点图标', section: '品牌与外观', kind: 'image', hint: '浏览器标签页上的小图标' },
  { key: 'site_theme', label: '当前模板', section: '品牌与外观', kind: 'select' },
  { key: 'site_keywords', label: 'SEO 关键词', section: 'SEO 与页脚', kind: 'textarea', hint: '多个关键词用英文逗号分隔' },
  { key: 'site_description', label: 'SEO 描述', section: 'SEO 与页脚', kind: 'textarea' },
  { key: 'site_disclaimer', label: '免责声明', section: 'SEO 与页脚', kind: 'textarea', hint: '显示在前台页脚' },
  { key: 'site_stats_code', label: '统计代码', section: 'SEO 与页脚', kind: 'textarea', hint: '原样输出到前台页面底部' },
  { key: 'list_page_size', label: '列表每页条数', section: '列表与上传', kind: 'text', hint: '建议保持 24（三行八列）' },
  { key: 'collect_log_keep_days', label: '采集记录保留天数', section: '列表与上传', kind: 'text', hint: '调度器每天清理一次' },
  { key: 'upload_max_mb', label: '单文件上传上限', section: '列表与上传', kind: 'text', hint: '单位 MB' },
];

const KEYS = FIELDS.map((field) => field.key);

function groupBySection(): { title: string; rows: Row[] }[] {
  const result: { title: string; rows: Row[] }[] = [];
  for (const row of FIELDS) {
    const last = result[result.length - 1];
    if (last && last.title === row.section) last.rows.push(row);
    else result.push({ title: row.section, rows: [row] });
  }
  return result;
}

const SECTIONS = groupBySection();

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
      <div class="body">
        <template v-for="(section, sectionIndex) in SECTIONS" :key="section.title">
          <div class="group-title" :class="{ first: sectionIndex === 0 }">{{ section.title }}</div>

          <div v-for="row in section.rows" :key="row.key" class="field">
            <label class="field-label">{{ row.label }}</label>
            <div class="field-ctrl">
              <ImageUpload v-if="row.kind === 'image'" v-model="form[row.key]" />
              <el-select v-else-if="row.kind === 'select'" v-model="form[row.key]" style="width: 220px">
                <el-option v-for="theme in themes" :key="theme.name" :label="theme.title" :value="theme.name" />
              </el-select>
              <el-input
                v-else-if="row.kind === 'textarea'"
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
}
.group-card :deep(.el-card__body) {
  padding: 8px 24px 0;
}
.body {
  max-width: 860px;
}
.group-title {
  margin: 18px 0 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.group-title.first {
  margin-top: 8px;
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 0;
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
.field-ctrl :deep(.image-upload) {
  max-width: 360px;
}
.card-foot {
  display: flex;
  gap: 10px;
  margin: 18px 0 0;
  padding: 14px 0 16px 116px;
  border-top: 1px solid var(--el-border-color);
}
</style>
