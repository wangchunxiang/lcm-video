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

interface SectionRow {
  key: string;
  label: string;
  hint?: string;
  kind: 'text' | 'image' | 'select' | 'textarea';
  /** 同一行右侧再放一个短字段 */
  secondary?: { key: string; label: string };
}

interface Section {
  title: string;
  rows: SectionRow[];
}

/** 站点设置页自己的字段，改这个页面不会影响其他设置页 */
const SECTIONS: Section[] = [
  {
    title: '站点信息',
    rows: [
      { key: 'site_name', label: '站点名称', kind: 'text', secondary: { key: 'site_subtitle', label: '副标题' } },
      { key: 'site_icp', label: '备案号', kind: 'text' },
    ],
  },
  {
    title: '品牌与外观',
    rows: [
      { key: 'site_logo', label: '站点 LOGO', kind: 'image', hint: '填写图片地址，或通过上传得到 /uploads/ 开头的路径。' },
      { key: 'site_favicon', label: '站点图标', kind: 'image' },
      { key: 'site_theme', label: '当前模板', kind: 'select' },
    ],
  },
  {
    title: 'SEO 与页脚',
    rows: [
      { key: 'site_keywords', label: 'SEO 关键词', kind: 'textarea' },
      { key: 'site_description', label: 'SEO 描述', kind: 'textarea' },
      { key: 'site_disclaimer', label: '免责声明', kind: 'textarea', hint: '显示在前台页脚。' },
      { key: 'site_stats_code', label: '统计代码', kind: 'textarea', hint: '原样输出到前台页面底部。' },
    ],
  },
  {
    title: '列表与上传',
    rows: [
      { key: 'list_page_size', label: '列表每页条数', kind: 'text', hint: '前台首页与分类页每页显示的影片数量，建议保持 24（三行八列）。' },
      { key: 'collect_log_keep_days', label: '采集记录保留天数', kind: 'text', hint: '调度器每天清理一次超出天数的采集记录。' },
      { key: 'upload_max_mb', label: '单文件上传上限（MB）', kind: 'text' },
    ],
  },
];

const KEYS = SECTIONS.flatMap((section) =>
  section.rows.flatMap((row) => (row.secondary ? [row.key, row.secondary.key] : [row.key])),
);

const form = reactive<Record<string, string>>({
  site_name: '',
  site_subtitle: '',
  site_icp: '',
  site_logo: '',
  site_favicon: '',
  site_theme: 'default',
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
      <div class="list">
        <template v-for="(section, sectionIndex) in SECTIONS" :key="section.title">
          <div v-if="sectionIndex > 0" class="section-gap"></div>

          <div v-for="row in section.rows" :key="row.key" class="row" :class="{ 'row-stack': row.kind === 'textarea' }">
            <div class="row-main">
              <span class="row-title">{{ row.label }}</span>
              <el-tooltip v-if="row.hint" :content="row.hint" placement="top">
                <el-icon class="row-tip"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>

            <div class="row-ctrl" :class="{ full: row.kind === 'textarea', pair: row.secondary }">
              <template v-if="row.secondary">
                <el-input v-model="form[row.key]" style="width: 180px" />
                <span class="pair-label">{{ row.secondary.label }}</span>
                <el-input v-model="form[row.secondary.key]" style="width: 180px" />
              </template>
              <el-input
                v-else-if="row.kind === 'textarea'"
                v-model="form[row.key]"
                type="textarea"
                :rows="3"
              />
              <ImageUpload v-else-if="row.kind === 'image'" v-model="form[row.key]" />
              <el-select v-else-if="row.kind === 'select'" v-model="form[row.key]" style="width: 200px">
                <el-option
                  v-for="theme in themes"
                  :key="theme.name"
                  :label="theme.title"
                  :value="theme.name"
                />
              </el-select>
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
.row-ctrl.pair {
  gap: 8px;
}
.pair-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.row-ctrl.full {
  margin-left: 0;
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
}
.row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 12px 0;
}
.row-stack .row-main {
  padding: 0;
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
