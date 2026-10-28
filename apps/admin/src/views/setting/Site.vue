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
}

interface Section {
  title: string;
  rows: Row[];
}

interface Tab {
  name: string;
  label: string;
  sections: Section[];
}

/** 站点设置页自己的字段，改这个页面不会影响其他设置页 */
const TABS: Tab[] = [
  {
    name: 'main',
    label: '站点设置',
    sections: [
      {
        title: '站点信息',
        rows: [
          { key: 'site_name', label: '站点名称', kind: 'text' },
          { key: 'site_subtitle', label: '站点副标题', kind: 'text' },
        ],
      },
      {
        title: '品牌与外观',
        rows: [
          { key: 'site_logo', label: '站点 LOGO', kind: 'image', hint: '留空则显示站名文字' },
          { key: 'site_favicon', label: '站点图标', kind: 'image', hint: '浏览器标签页上的小图标' },
          { key: 'site_theme', label: '当前模板', kind: 'select' },
        ],
      },
      {
        title: '页脚',
        rows: [
          { key: 'site_disclaimer', label: '免责声明', kind: 'textarea', hint: '显示在前台页脚' },
          { key: 'site_stats_code', label: '统计代码', kind: 'textarea', hint: '原样输出到前台页面底部' },
        ],
      },
    ],
  },
  {
    name: 'misc',
    label: '列表与上传',
    sections: [
      {
        title: '列表与上传',
        rows: [
          { key: 'list_page_size', label: '列表每页条数', kind: 'text', hint: '建议保持 24（三行八列）' },
          { key: 'collect_log_keep_days', label: '采集记录保留天数', kind: 'text', hint: '调度器每天清理一次' },
          { key: 'upload_max_mb', label: '单文件上传上限', kind: 'text', hint: '单位 MB' },
        ],
      },
    ],
  },
];

const KEYS = TABS.flatMap((tab) => tab.sections.flatMap((section) => section.rows.map((row) => row.key)));

const activeTab = ref(TABS[0]?.name ?? 'main');

const form = reactive<Record<string, string>>({
  site_name: '',
  site_subtitle: '',
  site_theme: 'default',
  site_logo: '',
  site_favicon: '',
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
      <el-tabs v-model="activeTab" class="tabs">
        <el-tab-pane v-for="tab in TABS" :key="tab.name" :label="tab.label" :name="tab.name">
          <div class="body">
            <template v-for="(section, sectionIndex) in tab.sections" :key="section.title">
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
        </el-tab-pane>
      </el-tabs>

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
  padding: 0 24px 0;
}
.tabs :deep(.el-tabs__header) {
  margin-bottom: 4px;
}
.body {
  max-width: 860px;
}
.group-title {
  margin: 14px 0 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.group-title.first {
  margin-top: 6px;
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
