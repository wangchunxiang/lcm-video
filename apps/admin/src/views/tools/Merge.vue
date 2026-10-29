<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface Member {
  id: number;
  name: string;
  year: number;
  status: number;
  playCount: number;
  collectedAt: string;
}

interface Group {
  key: string;
  name: string;
  year: number;
  members: Member[];
  playTotal: number;
}

interface Preview {
  auto: Group[];
  suspects: Group[];
  conflictCount: number;
  conflictExamples: Group[];
  summary: {
    autoGroups: number;
    autoVods: number;
    suspectGroups: number;
    conflictGroups: number;
  };
}

type BatchConfirm = { needConfirm: true; groups: number; vods: number };

const loading = ref(false);
const busy = ref(false);
const preview = ref<Preview | null>(null);
const tab = ref<'auto' | 'suspect'>('auto');
const selected = ref<Group[]>([]);

const autoGroups = computed(() => preview.value?.auto ?? []);
const suspectGroups = computed(() => preview.value?.suspects ?? []);

const yearText = (group: Group): string => {
  const years = [...new Set(group.members.map((item) => item.year).filter((year) => year > 0))];
  if (years.length === 0) return '未知';
  return years.join(' / ');
};

const memberText = (group: Group): string =>
  group.members.map((item) => `${item.name}（${item.id}）`).join('  ·  ');

async function load(): Promise<void> {
  loading.value = true;
  try {
    preview.value = await api.get<Preview>('/tools/merge-vods/preview');
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

/** 合并一组：保留线路最多的那条，其余线路并过去后删除 */
async function mergeGroup(group: Group): Promise<void> {
  const keep = [...group.members].sort((a, b) => b.playCount - a.playCount || a.id - b.id)[0]!;
  const ids = group.members.map((item) => item.id);
  const lines = group.members.map((item) => `${item.name}（${item.id}，${item.playCount} 条线路）`).join('<br>');

  await ElMessageBox.confirm(
    `<div>将合并以下 ${ids.length} 条影片，保留 ID ${keep.id}：</div><div style="margin-top:8px;line-height:1.8">${lines}</div>`,
    '合并影片',
    { dangerouslyUseHTMLString: true, confirmButtonText: '合并', cancelButtonText: '取消', type: 'warning' },
  );

  busy.value = true;
  try {
    const result = await api.post<{ merged: number }>('/tools/merge-vods', { ids });
    ElMessage.success(`已合并，减少 ${result.merged} 条`);
    await load();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    busy.value = false;
  }
}

/** 勾选后批量合并 */
async function mergeSelected(): Promise<void> {
  if (selected.value.length === 0) {
    ElMessage.warning('请先勾选要合并的分组');
    return;
  }
  const total = selected.value.reduce((sum, group) => sum + group.members.length - 1, 0);
  await ElMessageBox.confirm(
    `将合并 ${selected.value.length} 组、减少 ${total} 条影片，合并后不可撤销。`,
    '批量合并',
    { confirmButtonText: '合并', cancelButtonText: '取消', type: 'warning' },
  );

  busy.value = true;
  try {
    let merged = 0;
    for (const group of selected.value) {
      const result = await api.post<{ merged: number }>('/tools/merge-vods', {
        ids: group.members.map((item) => item.id),
      });
      merged += result.merged;
    }
    ElMessage.success(`已合并 ${selected.value.length} 组，减少 ${merged} 条`);
    selected.value = [];
    await load();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    busy.value = false;
  }
}

/** 一键合并全部可自动合并的分组 */
async function mergeAll(): Promise<void> {
  const confirm = await api.post<BatchConfirm>('/tools/merge-vods/batch', { confirm: false });
  await ElMessageBox.confirm(
    `将合并 ${confirm.groups} 组、减少 ${confirm.vods} 条影片，合并后不可撤销。`,
    '合并全部',
    { confirmButtonText: '全部合并', cancelButtonText: '取消', type: 'warning' },
  );

  busy.value = true;
  try {
    const result = await api.post<{ groups: number; merged: number }>('/tools/merge-vods/batch', {
      confirm: true,
    });
    ElMessage.success(`已合并 ${result.groups} 组，减少 ${result.merged} 条`);
    await load();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="filter-card">
      <div class="bar">
        <div class="tips">
          <span>判重按「去掉空白、保留标点」的片名做精确比较，所以同一部片只在空格写法不同时才会被自动认出。</span>
          <span>标点不同的（如「你好星期六」与「你好,星期六」）列在「疑似重复」，由你判断。</span>
        </div>
        <div class="actions">
          <el-button :loading="loading" @click="load">刷新</el-button>
          <el-button type="primary" :loading="busy" :disabled="autoGroups.length === 0" @click="mergeAll">
            合并全部自动组
          </el-button>
        </div>
      </div>
      <div v-if="preview" class="stats">
        <el-tag type="success">可自动合并 {{ preview.summary.autoGroups }} 组 / 减少 {{ preview.summary.autoVods }} 条</el-tag>
        <el-tag type="warning">疑似重复 {{ preview.summary.suspectGroups }} 组</el-tag>
        <el-tag type="info">年份冲突不合并 {{ preview.summary.conflictGroups }} 组</el-tag>
      </div>
    </el-card>

    <el-card shadow="never" class="list-card">
      <el-tabs v-model="tab" class="tabs">
        <el-tab-pane :label="`可自动合并（${autoGroups.length}）`" name="auto">
          <div class="toolbar">
            <span class="hint">这些组的片名去掉空白后完全相同，且年份一致，可以直接合并。</span>
            <el-button size="small" :disabled="selected.length === 0" :loading="busy" @click="mergeSelected">
              合并选中{{ selected.length ? `（${selected.length}）` : '' }}
            </el-button>
          </div>
          <el-table
            v-loading="loading"
            :data="autoGroups"
            border
            height="420"
            row-key="key"
            @selection-change="(rows: Group[]) => (selected = rows)"
          >
            <el-table-column type="selection" width="46" :selectable="(row: Group) => row.members.length > 1" />
            <el-table-column prop="name" label="影片名" min-width="240" show-overflow-tooltip />
            <el-table-column label="年份" width="100" align="center">
              <template #default="{ row }">{{ yearText(row) }}</template>
            </el-table-column>
            <el-table-column label="条数" width="80" align="center">
              <template #default="{ row }">{{ row.members.length }}</template>
            </el-table-column>
            <el-table-column label="线路合计" width="100" align="center">
              <template #default="{ row }">{{ row.playTotal }}</template>
            </el-table-column>
            <el-table-column label="成员（ID）" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">{{ memberText(row) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" align="center" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" :loading="busy" @click="mergeGroup(row)">合并</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="`疑似重复（${suspectGroups.length}）`" name="suspect">
          <div class="toolbar">
            <span class="hint">片名去掉标点后相同，但严格比较不同；确认是同一部后再合并。</span>
          </div>
          <el-table v-loading="loading" :data="suspectGroups" border height="420">
            <el-table-column prop="name" label="影片名" min-width="240" show-overflow-tooltip />
            <el-table-column label="年份" width="100" align="center">
              <template #default="{ row }">{{ yearText(row) }}</template>
            </el-table-column>
            <el-table-column label="条数" width="80" align="center">
              <template #default="{ row }">{{ row.members.length }}</template>
            </el-table-column>
            <el-table-column label="成员（ID）" min-width="320" show-overflow-tooltip>
              <template #default="{ row }">{{ memberText(row) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" align="center" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" :loading="busy" @click="mergeGroup(row)">合并</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.filter-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.tips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.stats {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.list-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.list-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 16px 16px;
}

.tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0 10px;
}

.hint {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
