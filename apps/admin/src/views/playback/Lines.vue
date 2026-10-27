<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client.ts';

interface LineItem {
  id: number;
  sourceFrom: string;
  name: string;
  sort: number;
  isEnabled: number;
  sourceName: string;
  vodCount: number;
}

const loading = ref(false);
const items = ref<LineItem[]>([]);

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: LineItem[] }>('/lines');
    items.value = data.items;
  } finally {
    loading.value = false;
  }
}

async function patch(row: LineItem, body: Record<string, unknown>) {
  try {
    await api.put(`/lines/${row.id}`, body);
    ElMessage.success('已保存');
  } catch {
    await load();
  }
}

function saveName(row: LineItem) {
  if (row.name.trim().length > 50) {
    ElMessage.warning('显示名不能超过 50 个字符');
    return;
  }
  void patch(row, { name: row.name.trim() });
}

function saveSort(row: LineItem) {
  const sort = Number(row.sort);
  if (!Number.isFinite(sort) || sort < 0) {
    ElMessage.warning('排序需要是不小于 0 的整数');
    void load();
    return;
  }
  void patch(row, { sort: Math.trunc(sort) });
}

function toggleStatus(row: LineItem) {
  void patch(row, { is_enabled: row.isEnabled });
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="card">
      <template #header>
        <div class="card-head">
          <span class="card-title">线路管理</span>
          <span class="card-tip">显示名留空时，前台用采集源名称；停用的线路不在前台出现</span>
        </div>
      </template>

      <el-table v-loading="loading" :data="items" border stripe row-key="id">
        <el-table-column prop="sourceFrom" label="线路标识" min-width="180">
          <template #default="{ row }">
            <span class="code">{{ row.sourceFrom }}</span>
          </template>
        </el-table-column>
        <el-table-column label="显示名" min-width="220">
          <template #default="{ row }">
            <el-input
              v-model="row.name"
              size="small"
              :placeholder="row.sourceName || row.sourceFrom"
              maxlength="50"
              @blur="saveName(row)"
              @keyup.enter="saveName(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="来源" min-width="140">
          <template #default="{ row }">
            <span v-if="row.sourceName">{{ row.sourceName }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="vodCount" label="线路数" width="90" align="center" />
        <el-table-column label="排序" width="100" align="center">
          <template #default="{ row }">
            <el-input v-model="row.sort" size="small" class="sort-input" @change="saveSort(row)" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.isEnabled === 1"
              @change="
                (value: string | number | boolean) => {
                  row.isEnabled = value ? 1 : 0;
                  toggleStatus(row);
                }
              "
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
}
.card-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
}
.card-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.muted {
  color: var(--el-text-color-placeholder);
}
.sort-input {
  width: 64px;
}
.sort-input :deep(input) {
  text-align: center;
}
</style>
