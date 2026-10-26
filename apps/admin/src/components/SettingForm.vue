<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { SettingField } from '@lcm/shared';
import { api } from '../api/client.ts';
import ImageUpload from './ImageUpload.vue';

interface ThemeItem {
  name: string;
  title: string;
  active: boolean;
}

const props = defineProps<{ group: 'base' | 'site' }>();

const fields = ref<(SettingField & { value: string })[]>([]);
const themes = ref<ThemeItem[]>([]);
const loading = ref(false);
const saving = ref(false);

const groupFields = computed(() => fields.value.filter((field) => field.group === props.group));

function optionsOf(field: SettingField) {
  if (field.key === 'site_theme') {
    return themes.value.map((theme) => ({ label: theme.title, value: theme.name }));
  }
  return field.options ?? [];
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: (SettingField & { value: string })[]; themes: ThemeItem[] }>('/settings');
    fields.value = data.items;
    themes.value = data.themes;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const values: Record<string, string> = {};
  for (const field of groupFields.value) values[field.key] = field.value ?? '';

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

onMounted(load);
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <el-form label-width="160px" class="setting-form">
      <el-form-item v-for="field in groupFields" :key="field.key" :label="field.label">
        <ImageUpload
          v-if="field.key === 'site_logo' || field.key === 'site_favicon'"
          v-model="field.value"
          :tip="field.hint"
        />
        <el-select v-else-if="field.type === 'select'" v-model="field.value" class="field">
          <el-option v-for="option in optionsOf(field)" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-switch
          v-else-if="field.type === 'switch'"
          v-model="field.value"
          active-value="1"
          inactive-value="0"
        />
        <el-input
          v-else-if="field.type === 'textarea'"
          v-model="field.value"
          type="textarea"
          :rows="3"
          class="field"
        />
        <el-input v-else v-model="field.value" class="field" />
        <div v-if="field.hint && field.key !== 'site_logo' && field.key !== 'site_favicon'" class="hint">
          {{ field.hint }}
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button @click="load">重置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<style scoped>
.setting-form {
  max-width: 720px;
}
.field {
  width: 100%;
}
.hint {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
</style>
