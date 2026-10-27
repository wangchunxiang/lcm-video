<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { SETTINGS } from '@lcm/shared/settings';
import PlayerPreview from '../../components/PlayerPreview.vue';
import { api } from '../../api/client';

interface Field {
  key: string;
  label: string;
  type: string;
  default: string;
  hint?: string;
  group: string;
}

const all = SETTINGS as Field[];
const playbackFields = all.filter((item) => item.group === 'playback');

const values = ref<Record<string, string>>({});
let snapshot: Record<string, string> = {};
const loading = ref(false);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ items: { key: string; value: string }[] }>('/settings');
    const next: Record<string, string> = {};
    for (const field of playbackFields) {
      const hit = res.items.find((item) => item.key === field.key);
      next[field.key] = hit ? hit.value : field.default;
    }
    values.value = next;
    snapshot = { ...next };
  } finally {
    loading.value = false;
  }
}

function reset(fields: Field[]) {
  const next = { ...values.value };
  for (const field of fields) next[field.key] = snapshot[field.key] ?? field.default;
  values.value = next;
}

async function save(fields: Field[]) {
  saving.value = true;
  try {
    const payload: Record<string, string> = {};
    for (const field of fields) payload[field.key] = values.value[field.key] ?? field.default;
    await api.put('/settings', { values: payload });
    snapshot = { ...snapshot, ...payload };
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="left">
      <el-card shadow="never" class="preview-card">
        <PlayerPreview :options="values" />
      </el-card>

    </div>

    <el-card shadow="never" class="right">
      <el-table :data="playbackFields" border class="setting-table">
        <el-table-column label="设置项" width="180">
          <template #default="{ row }">{{ row.label }}</template>
        </el-table-column>
        <el-table-column label="设置值" width="200">
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
        <el-button @click="reset(playbackFields)">重置</el-button>
        <el-button type="primary" :loading="saving" @click="save(playbackFields)">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.preview-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.preview-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.right {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.right :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
}
.setting-table {
  flex: none;
}
.setting-table :deep(.el-table__cell) {
  padding: 10px 0;
}
.setting-table .hint {
  margin-top: 0;
}
.foot {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
