<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { SETTINGS } from '@lcm/shared/settings';
import { api } from '../../api/client';

interface Field {
  key: string;
  label: string;
  type: string;
  hint?: string;
}

const fields = SETTINGS.filter((item) => item.group === 'playback') as Field[];

const values = ref<Record<string, string>>({});
let snapshot: Record<string, string> = {};
const loading = ref(false);
const saving = ref(false);

function defaultValue(field: Field): string {
  return SETTINGS.find((item) => item.key === field.key)?.default ?? '';
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ items: { key: string; value: string }[] }>('/settings');
    const next: Record<string, string> = {};
    for (const field of fields) {
      const hit = res.items.find((item) => item.key === field.key);
      next[field.key] = hit ? hit.value : defaultValue(field);
    }
    values.value = next;
    snapshot = { ...next };
  } finally {
    loading.value = false;
  }
}

function reset() {
  values.value = { ...snapshot };
}

async function save() {
  saving.value = true;
  try {
    await api.put('/settings', { values: values.value });
    snapshot = { ...values.value };
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card v-loading="loading" shadow="never" class="main">
      <template #header>
        <span class="card-title">播放设置</span>
      </template>

      <el-table :data="fields" border class="setting-table">
        <el-table-column label="设置项" width="200">
          <template #default="{ row }">{{ row.label }}</template>
        </el-table-column>
        <el-table-column label="设置值" width="240">
          <template #default="{ row }">
            <el-switch
              v-if="row.type === 'switch'"
              :model-value="values[row.key] === '1'"
              @change="(checked: any) => (values[row.key] = checked ? '1' : '0')"
            />
            <el-input
              v-else
              :model-value="values[row.key]"
              @update:model-value="(value: string) => (values[row.key] = value)"
            />
          </template>
        </el-table-column>
        <el-table-column label="说明">
          <template #default="{ row }">
            <span class="hint">{{ row.hint || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="foot">
        <el-button @click="reset">重置</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.main :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
}
.setting-table {
  flex: none;
}
.setting-table :deep(.el-table__cell) {
  padding: 10px 0;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
