<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
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
const total = ref(0);
const selection = ref<LineItem[]>([]);

const filters = reactive({ keyword: '', status: '' });
const pager = reactive({ page: 1, page_size: 20 });

async function load() {
  loading.value = true;
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(pager.page));
  params.set('page_size', String(pager.page_size));
  try {
    const data = await api.get<{ items: LineItem[]; total: number; page: number; page_size: number }>(
      `/lines?${params.toString()}`,
    );
    items.value = data.items;
    total.value = data.total;
    selection.value = [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载线路失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  pager.page = 1;
  void load();
}

function reset() {
  filters.keyword = '';
  filters.status = '';
  pager.page = 1;
  void load();
}

function changePage(page: number) {
  pager.page = page;
  void load();
}

function changePageSize(size: number) {
  pager.page_size = size;
  pager.page = 1;
  void load();
}

async function patch(row: LineItem, body: Record<string, unknown>) {
  try {
    await api.put(`/lines/${row.id}`, body);
    ElMessage.success('已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
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

async function batch(action: 'enable' | 'disable') {
  if (selection.value.length === 0) {
    ElMessage.warning('请先选择线路');
    return;
  }
  const label = action === 'enable' ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(`确定${label}选中的 ${selection.value.length} 条线路吗？`, `${label}线路`, {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await api.post('/lines/batch', { ids: selection.value.map((row) => row.id), action });
    ElMessage.success(`已${label}`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : `${label}失败`);
  }
}

onMounted(load);

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!wrapRef.value) return;
  resizeObserver = new ResizeObserver(() => {
    tableHeight.value = wrapRef.value?.clientHeight ?? 400;
  });
  resizeObserver.observe(wrapRef.value);
  tableHeight.value = wrapRef.value.clientHeight;
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="search-card">
      <div class="search-bar">
        <el-input
          v-model="filters.keyword"
          placeholder="线路标识 / 显示名"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 120px">
          <el-option label="启用" value="1" />
          <el-option label="停用" value="0" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-button :disabled="selection.length === 0" @click="batch('enable')">批量启用</el-button>
        <el-button :disabled="selection.length === 0" @click="batch('disable')">批量停用</el-button>
        <span class="hint">显示名留空时用采集源名称；停用的线路不在前台出现</span>
      </div>
      <div ref="wrapRef" class="table-wrap">
        <el-table
          v-loading="loading"
          :data="items"
          :height="tableHeight"
          row-key="id"
          border
          stripe
          @selection-change="(rows: LineItem[]) => (selection = rows)"
        >
          <el-table-column type="selection" width="46" />
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
      </div>
      <el-pagination
        class="pager"
        :current-page="pager.page"
        :page-size="pager.page_size"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @current-change="changePage"
        @size-change="changePageSize"
      />
    </el-card>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search-card {
  flex: none;
}
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.table-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.table-wrap {
  flex: 1;
  min-height: 0;
}
.search-bar {
  display: flex;
  align-items: center;
}
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.muted {
  color: var(--el-text-color-secondary);
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sort-input {
  width: 64px;
}
.sort-input :deep(input) {
  text-align: center;
}
</style>
