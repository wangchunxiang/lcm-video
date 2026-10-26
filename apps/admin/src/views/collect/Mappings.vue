<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface SourceRow {
  id: number;
  name: string;
  apiFormat: string;
}

interface SourceCategoryRow {
  id: number;
  sourceTypeId: string;
  sourceTypeName: string;
  sourceTypePid: string;
  categoryId: number;
  matchType: number;
  status: number;
  categoryName: string | null;
  categoryPid: number | null;
}

interface CategoryNode {
  id: number;
  pid: number;
  name: string;
  children?: CategoryNode[];
}

const sources = ref<SourceRow[]>([]);
const sourceId = ref(0);
const rows = ref<SourceCategoryRow[]>([]);
const summary = ref({ total: 0, mapped: 0, ignored: 0, unmapped: 0 });
const loading = ref(false);
const fetching = ref(false);
const matching = ref(false);

const categoryOptions = ref<{ id: number; label: string }[]>([]);

type StatusFilter = 'all' | '1' | '0' | '2';
const statusFilter = ref<StatusFilter>('all');

const filteredRows = computed(() => {
  if (statusFilter.value === 'all') return rows.value;
  const target = Number(statusFilter.value);
  return rows.value.filter((row) => row.status === target);
});

function toggleFilter(value: StatusFilter) {
  statusFilter.value = statusFilter.value === value ? 'all' : value;
}

async function loadSources() {
  const data = await api.get<{ items: SourceRow[] }>('/sources');
  sources.value = data.items;
  if (sourceId.value === 0 && sources.value.length > 0) {
    sourceId.value = sources.value[0].id;
  }
}

async function loadCategories() {
  const data = await api.get<{ items: CategoryNode[] }>('/categories');
  const options: { id: number; label: string }[] = [];
  for (const node of data.items) {
    options.push({ id: node.id, label: node.name });
    for (const child of node.children ?? []) {
      options.push({ id: child.id, label: `${node.name} / ${child.name}` });
    }
  }
  categoryOptions.value = options;
}

async function load() {
  if (sourceId.value <= 0) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const data = await api.get<{ items: SourceCategoryRow[]; summary: typeof summary.value }>(
      `/sources/${sourceId.value}/categories`,
    );
    rows.value = data.items;
    summary.value = data.summary;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载映射失败');
  } finally {
    loading.value = false;
  }
}

async function fetchCategories() {
  if (sourceId.value <= 0) return;
  fetching.value = true;
  try {
    const data = await api.post<{ fetched: number; mapped: number; matched: number }>(
      `/sources/${sourceId.value}/fetch-categories`,
    );
    ElMessage.success(`获取到 ${data.fetched} 个分类，已映射 ${data.mapped} 个，本次自动匹配 ${data.matched} 个`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '获取分类失败');
  } finally {
    fetching.value = false;
  }
}

async function autoMatch() {
  if (sourceId.value <= 0) return;
  matching.value = true;
  try {
    const data = await api.post<{ scanned: number; matched: number }>(`/sources/${sourceId.value}/categories/match`);
    ElMessage.success(`扫描 ${data.scanned} 个未映射分类，自动匹配 ${data.matched} 个`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '自动匹配失败');
  } finally {
    matching.value = false;
  }
}

async function applyRow(row: SourceCategoryRow, categoryId: number) {
  try {
    await api.put(`/sources/${sourceId.value}/categories/${row.id}`, { category_id: categoryId });
    ElMessage.success('已映射');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '映射失败');
    await load();
  }
}

async function ignoreRow(row: SourceCategoryRow) {
  try {
    await api.put(`/sources/${sourceId.value}/categories/${row.id}`, { status: 2 });
    ElMessage.success('已忽略');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function restoreRow(row: SourceCategoryRow) {
  try {
    await api.put(`/sources/${sourceId.value}/categories/${row.id}`, { status: 0, category_id: 0 });
    ElMessage.success('已恢复为未映射');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function remapVods(row: SourceCategoryRow) {
  try {
    await ElMessageBox.confirm(
      `将把该分类下已入库的影片改成当前映射的分类，可能影响大量数据，确定继续吗？`,
      '按新映射重刷',
      { type: 'warning', confirmButtonText: '开始重刷', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    const data = await api.post<{ affected: number; from: number; to: number }>(
      `/sources/${sourceId.value}/categories/${row.id}/remap-vods`,
    );
    ElMessage.success(`已重刷 ${data.affected} 部影片`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重刷失败');
  }
}

function statusTag(row: SourceCategoryRow): { text: string; type: 'success' | 'info' | 'warning' } {
  if (row.status === 1) return { text: '已映射', type: 'success' };
  if (row.status === 2) return { text: '已忽略', type: 'info' };
  return { text: '未映射', type: 'warning' };
}

function matchTag(row: SourceCategoryRow): string {
  if (row.matchType === 1) return '自动';
  if (row.matchType === 2) return '手动';
  return '—';
}

watch(sourceId, () => {
  statusFilter.value = 'all';
  void load();
});

onMounted(async () => {
  await loadSources();
  await loadCategories();
  await load();
});
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
    <div class="filter-row">
    <div class="toolbar">
      <el-select v-model="sourceId" placeholder="选择采集源" style="width: 200px">
        <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-button type="primary" :loading="fetching" @click="fetchCategories">获取分类</el-button>
      <el-button :loading="matching" @click="autoMatch">自动匹配</el-button>
      <el-button @click="load">刷新</el-button>
    </div>

    <div class="summary">
      <el-tag
        :effect="statusFilter === 'all' ? 'dark' : 'plain'"
        class="clickable"
        @click="statusFilter = 'all'"
      >
        共 {{ summary.total }}
      </el-tag>
      <el-tag
        type="success"
        :effect="statusFilter === '1' ? 'dark' : 'plain'"
        class="clickable"
        @click="toggleFilter('1')"
      >
        已映射 {{ summary.mapped }}
      </el-tag>
      <el-tag
        type="warning"
        :effect="statusFilter === '0' ? 'dark' : 'plain'"
        class="clickable"
        @click="toggleFilter('0')"
      >
        未映射 {{ summary.unmapped }}
      </el-tag>
      <el-tag
        type="info"
        :effect="statusFilter === '2' ? 'dark' : 'plain'"
        class="clickable"
        @click="toggleFilter('2')"
      >
        已忽略 {{ summary.ignored }}
      </el-tag>
    </div>
    </div>
  </el-card>

  <el-card shadow="never" class="fill-card">
    <div ref="wrapRef" class="table-wrap">
    <el-table
      :height="tableHeight"
      v-loading="loading"
      :data="filteredRows"
      border
      stripe
      empty-text="该采集源还没有源站分类，请先点击「获取分类」"
    >
      <el-table-column label="源站分类" min-width="200">
        <template #default="{ row }">
          <span :class="row.sourceTypePid !== '0' ? 'child' : ''">{{ row.sourceTypeName }}</span>
          <span class="muted"> ({{ row.sourceTypeId }})</span>
        </template>
      </el-table-column>
      <el-table-column label="本站分类" min-width="220">
        <template #default="{ row }">
          <el-select
            :model-value="row.categoryId || undefined"
            filterable
            clearable
            placeholder="未映射"
            size="small"
            @update:model-value="(value: number | undefined) => value && applyRow(row, value)"
          >
            <el-option v-for="item in categoryOptions" :key="item.id" :label="item.label" :value="item.id" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="匹配方式" width="90" align="center">
        <template #default="{ row }">{{ matchTag(row) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTag(row).type" size="small">{{ statusTag(row).text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status !== 2" link type="warning" @click="ignoreRow(row)">忽略</el-button>
          <el-button v-else link type="primary" @click="restoreRow(row)">恢复</el-button>
          <el-button v-if="row.status === 1" link type="danger" @click="remapVods(row)">重刷影片</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>
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
.fill-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fill-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.toolbar,
.summary,
.batch,
.batch-bar,
.pager {
  flex: none;
}
.table-wrap {
  flex: 1;
  min-height: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.filter-row .toolbar {
  margin-bottom: 0;
}
.summary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
}
.clickable {
  cursor: pointer;
  user-select: none;
}
.child {
  padding-left: 16px;
  color: var(--el-text-color-regular);
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
