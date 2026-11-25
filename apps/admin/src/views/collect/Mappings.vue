<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { buildListQuery } from '@lcm/api-client';
import { api } from '../../api/client.ts';
import ProTable from '../../components/ProTable.vue';

interface SourceRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  name: string;
}

interface SourceCategoryRow {
  id: string;
  sourceId: string;
  sourceTypeId: string;
  sourceTypeName: string;
  sourceTypePid: string;
  categoryId: string;
  matchType: number;
  status: number;
}

interface CategoryNode {
  id: string;
  pid: string;
  name: string;
  children?: CategoryNode[];
}

interface MappingSummary {
  total: number;
  mapped: number;
  ignored: number;
  unmapped: number;
}

interface FetchCategoriesResult {
  total: number;
  synced: number;
  matched: number;
  unmapped: number;
}

const sources = ref<SourceRow[]>([]);
const sourceId = ref('');
const rows = ref<SourceCategoryRow[]>([]);
const summary = ref<MappingSummary>({ total: 0, mapped: 0, ignored: 0, unmapped: 0 });
const loading = ref(false);
const fetching = ref(false);
const matching = ref(false);

const categoryTree = ref<CategoryNode[]>([]);

type StatusFilter = 'all' | '1' | '0' | '2';
const statusFilter = ref<StatusFilter>('all');
const selected = ref<SourceCategoryRow[]>([]);

/** 记录每行上一次的映射分类，重刷已入库影片时用它定位「旧分类」。 */
const lastCategoryIds = ref<Record<string, string>>({});

const filteredRows = computed(() => {
  if (statusFilter.value === 'all') return rows.value;
  const target = Number(statusFilter.value);
  return rows.value.filter((row) => row.status === target);
});

interface TreeRow extends SourceCategoryRow {
  children?: TreeRow[];
}

/**
 * 源站分类 id 是数字字符串，按数值排才能和源站自己的菜单顺序一致；
 * 服务端返回的顺序是分类名（数据库排序规则按码点，中文等于乱序）。
 */
function bySourceOrder(a: TreeRow, b: TreeRow): number {
  const left = Number(a.sourceTypeId);
  const right = Number(b.sourceTypeId);
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
  return a.sourceTypeName.localeCompare(b.sourceTypeName, 'zh-Hans-CN');
}

const treeRows = computed<TreeRow[]>(() => {
  const byId = new Map<string, TreeRow>();
  for (const row of filteredRows.value) {
    byId.set(row.sourceTypeId, { ...row, children: [] });
  }
  const roots: TreeRow[] = [];
  for (const row of filteredRows.value) {
    const node = byId.get(row.sourceTypeId);
    if (!node) continue;
    const parent = row.sourceTypePid !== '0' ? byId.get(row.sourceTypePid) : undefined;
    if (parent) parent.children?.push(node);
    else roots.push(node);
  }
  const strip = (nodes: TreeRow[]) => {
    nodes.sort(bySourceOrder);
    for (const node of nodes) {
      if (node.children && node.children.length > 0) strip(node.children);
      else delete node.children;
    }
  };
  strip(roots);
  return roots;
});

function toggleFilter(value: StatusFilter) {
  statusFilter.value = statusFilter.value === value ? 'all' : value;
}

/** 更新映射前记下旧分类，供「重刷」使用。 */
function rememberCategory(row: SourceCategoryRow) {
  if (row.categoryId) lastCategoryIds.value[row.id] = row.categoryId;
}

async function loadSources() {
  const data = await api.get<{ items: SourceRow[]; total: number }>(
    '/collect-source',
    buildListQuery({ take: 100, order: { id: 'ASC' } }),
  );
  sources.value = data.items;
  const first = sources.value[0];
  if (!sourceId.value && first) {
    sourceId.value = first.id;
  }
}

async function loadCategories() {
  categoryTree.value = await api.post<CategoryNode[]>('/category/tree');
}

async function load() {
  if (!sourceId.value) {
    rows.value = [];
    selected.value = [];
    summary.value = { total: 0, mapped: 0, ignored: 0, unmapped: 0 };
    return;
  }
  loading.value = true;
  try {
    const data = await api.post<{ items: SourceCategoryRow[]; summary: MappingSummary }>(
      '/collect-source-category/by-source',
      { sourceId: sourceId.value },
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
  if (!sourceId.value) return;
  fetching.value = true;
  try {
    const data = await api.longPost<FetchCategoriesResult>('/collect-source/fetch-categories', {
      id: sourceId.value,
    });
    const mapped = Math.max(data.total - data.unmapped, 0);
    ElMessage.success(`获取到 ${data.total} 个分类，已映射 ${mapped} 个，本次自动匹配 ${data.matched} 个`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '获取分类失败');
  } finally {
    fetching.value = false;
  }
}

async function autoMatch() {
  if (!sourceId.value) return;
  matching.value = true;
  try {
    const data = await api.post<{ scanned: number; matched: number }>('/collect-source-category/match', {
      sourceId: sourceId.value,
    });
    ElMessage.success(`扫描 ${data.scanned} 个未映射分类，自动匹配 ${data.matched} 个`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '自动匹配失败');
  } finally {
    matching.value = false;
  }
}

async function applyRow(row: SourceCategoryRow, categoryId: string) {
  const target = categoryId ?? '';
  try {
    rememberCategory(row);
    const body = target ? { ids: [row.id], categoryId: target } : { ids: [row.id], status: 0 };
    await api.post<{ updated: number }>('/collect-source-category/map', body);
    ElMessage.success(target ? '已映射' : '已取消映射');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '映射失败');
  }
  await load();
}

async function ignoreRow(row: SourceCategoryRow) {
  try {
    await api.post('/collect-source-category/map', { ids: [row.id], status: 2 });
    ElMessage.success('已忽略分类');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function restoreRow(row: SourceCategoryRow) {
  try {
    await api.post('/collect-source-category/map', { ids: [row.id], status: 0 });
    ElMessage.success('已恢复为未映射');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function batchApply(payload: { status: number }, action: string) {
  const count = selected.value.length;
  const names = selected.value.slice(0, 3).map((row) => row.sourceTypeName).join('、');
  const more = count > 3 ? ` 等 ${count} 个` : '';
  try {
    await ElMessageBox.confirm(
      `将对「${names}」${more} 执行${action}。已入库影片的分类不变。`,
      action,
      { type: 'warning', confirmButtonText: action, cancelButtonText: '返回' },
    );
  } catch {
    return;
  }
  try {
    const data = await api.post<{ updated: number }>('/collect-source-category/map', {
      ids: selected.value.map((row) => row.id),
      ...payload,
    });
    ElMessage.success(`已${action} ${data.updated} 个分类`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function unmapSelected() {
  await batchApply({ status: 0 }, '取消映射');
}

async function ignoreSelected() {
  await batchApply({ status: 2 }, '忽略分类');
}

async function unmapRow(row: SourceCategoryRow) {
  try {
    await ElMessageBox.confirm(
      '取消映射后该源站分类回到「未映射」，之后采集到的影片会被跳过；已入库影片的分类不变。',
      '取消映射',
      { type: 'warning', confirmButtonText: '取消映射', cancelButtonText: '返回' },
    );
  } catch {
    return;
  }
  await applyRow(row, '');
}

async function remapVods(row: SourceCategoryRow) {
  if (!row.categoryId) {
    ElMessage.warning('这条源站分类还没有映射到本站分类');
    return;
  }
  // 服务端需要「影片当前所在分类」定位要重刷的数据，即映射变更前的旧分类
  const remembered = lastCategoryIds.value[row.id] ?? '';
  let fromCategoryId = remembered;
  try {
    const { value } = await ElMessageBox.prompt(
      `将把「${row.sourceTypeName}」下已入库的影片改成当前映射的分类（ID ${row.categoryId}），可能影响大量数据。请确认这些影片当前所在的本站分类 ID：`,
      '按新映射重刷',
      {
        type: 'warning',
        confirmButtonText: '开始重刷',
        cancelButtonText: '取消',
        inputValue: remembered,
        inputPattern: /^\d+$/,
        inputErrorMessage: '请输入数字分类 ID',
        inputPlaceholder: '影片当前所在分类 ID',
      },
    );
    fromCategoryId = String(value ?? '');
  } catch {
    return;
  }
  if (!fromCategoryId) return;
  try {
    const data = await api.post<{ affected: number; from: string; to: string }>(
      '/collect-source-category/remap-vods',
      { sourceId: sourceId.value, id: row.id, fromCategoryId },
    );
    ElMessage.success(`已重刷 ${data.affected} 部影片`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重刷失败');
    await load();
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
      <el-divider direction="vertical" />
      <el-button type="warning" plain :disabled="selected.length === 0" @click="unmapSelected">取消映射</el-button>
      <el-button type="info" plain :disabled="selected.length === 0" @click="ignoreSelected">忽略分类</el-button>
    </div>

    <div class="summary">
      <el-button type="primary" :plain="statusFilter !== 'all'" @click="statusFilter = 'all'">
        共 {{ summary.total }}
      </el-button>
      <el-button type="success" :plain="statusFilter !== '1'" @click="toggleFilter('1')">
        已映射 {{ summary.mapped }}
      </el-button>
      <el-button type="warning" :plain="statusFilter !== '0'" @click="toggleFilter('0')">
        未映射 {{ summary.unmapped }}
      </el-button>
      <el-button type="info" :plain="statusFilter !== '2'" @click="toggleFilter('2')">
        已忽略 {{ summary.ignored }}
      </el-button>
    </div>
    </div>
  </el-card>

  <el-card shadow="never" class="fill-card">
    <ProTable
      :data="treeRows"
      :loading="loading"
      :show-pager="false"
      row-key="id"
      default-expand-all
      :tree-props="{ children: 'children' }"
      border
      stripe
      empty-text="该采集源还没有源站分类，请先点击「获取分类」"
      @selection-change="(rows) => (selected = rows as SourceCategoryRow[])"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column prop="sourceTypeName" label="源站分类" min-width="260" show-overflow-tooltip />
      <el-table-column prop="sourceTypeId" label="源站分类ID" width="110" align="center" show-overflow-tooltip />
      <el-table-column label="本站分类" min-width="260">
        <template #default="{ row }">
          <el-tree-select
            :model-value="row.categoryId || undefined"
            :data="categoryTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            check-strictly
            :render-after-expand="false"
            default-expand-all
            filterable
            clearable
            placeholder="未映射"
            size="small"
            @update:model-value="(value: string | undefined) => applyRow(row, value ?? '')"
          />
        </template>
      </el-table-column>
      <el-table-column label="本站分类ID" width="110" align="center">
        <template #default="{ row }">
          <span v-if="row.categoryId">{{ row.categoryId }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="匹配方式" width="100" align="center">
        <template #default="{ row }">{{ matchTag(row) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTag(row).type" size="small">{{ statusTag(row).text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" fixed="right" align="center">
        <template #default="{ row }">
          <el-button v-if="row.status !== 2" link type="warning" @click="ignoreRow(row)">忽略</el-button>
          <el-button v-else link type="primary" @click="restoreRow(row)">恢复</el-button>
          <el-button v-if="row.status === 1" link type="info" @click="unmapRow(row)">取消</el-button>
          <el-button v-if="row.status === 1" link type="danger" @click="remapVods(row)">重刷</el-button>
        </template>
      </el-table-column>
    </ProTable>
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
.batch-bar {
  flex: none;
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
  align-items: center;
  flex-wrap: nowrap;
  margin-left: auto;
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
