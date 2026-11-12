<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';
import { buildListQuery } from '@lcm/api-client';
import VodEditDialog from '../../components/VodEditDialog.vue';
import { formatDateTime } from '../../utils/datetime.ts';

interface VodRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  name: string;
  categoryId: string;
  categoryPid: string;
  categoryName: string;
  parentName: string;
  year: number;
  remarks: string;
  status: number;
  episodeCount: number;
  /** 线路条数（服务端统计） */
  plays: number;
  /** 实际剧集数（服务端统计） */
  episodes: number;
  collectedAt: string;
}

interface CategoryNode {
  id: string;
  pid: string;
  name: string;
  children?: CategoryNode[];
}

const items = ref<VodRow[]>([]);
const selection = ref<VodRow[]>([]);
const tableRef = ref<{ clearSelection: () => void } | null>(null);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const categories = ref<CategoryNode[]>([]);

const filters = reactive({
  keyword: '',
  category_id: null as string | null,
  status: '' as '' | '0' | '1',
  sort: 'time' as 'time' | 'new',
});

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;

const treeProps = { label: 'name', children: 'children' };

async function loadCategories() {
  try {
    categories.value = await api.post<CategoryNode[]>('/category/tree');
  } catch {
    categories.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const where: Record<string, unknown> = {};
    if (filters.keyword.trim()) where['name'] = { $like: `%${filters.keyword.trim()}%` };
    if (filters.category_id) where['categoryId'] = filters.category_id;
    if (filters.status !== '') where['status'] = Number(filters.status);

    const query = buildListQuery({
      take: pageSize.value,
      skip: (page.value - 1) * pageSize.value,
      where,
      order: filters.sort === 'new' ? { id: 'DESC' } : { collectedAt: 'DESC' },
    });
    const data = await api.get<{ items: VodRow[]; total: number }>('/vod', query);
    items.value = data.items;
    total.value = data.total;
    selection.value = [];
    tableRef.value?.clearSelection();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载影片失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void load();
}

function reset() {
  filters.keyword = '';
  filters.category_id = null;
  filters.status = '';
  filters.sort = 'time';
  search();
}

function rowIndex(index: number): number {
  return (page.value - 1) * pageSize.value + index + 1;
}

function onPageChange(next: number) {
  page.value = next;
  void load();
}

function onSelectionChange(rows: VodRow[]) {
  selection.value = rows;
}

const editVisible = ref(false);
const editingId = ref('');

function edit(row: VodRow) {
  editingId.value = row.id;
  editVisible.value = true;
}

interface VodSourceOption {
  id: string;
  name: string;
  lines: number;
}

interface VodPlayLine {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceFrom: string;
}

const vodSources = ref<Record<string, VodSourceOption[]>>({});
const sourcesLoading = ref('');

function hasSources(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(vodSources.value, id);
}

async function ensureSources(row: VodRow) {
  if (hasSources(row.id) || sourcesLoading.value === row.id) return;
  sourcesLoading.value = row.id;
  try {
    const lines = await api.post<VodPlayLine[]>('/vod-play/by-vod', { vodId: row.id });
    const map = new Map<string, VodSourceOption>();
    for (const line of lines) {
      if (line.sourceId === '0' || line.sourceId === '') continue;
      const found = map.get(line.sourceId);
      if (found) found.lines += 1;
      else map.set(line.sourceId, { id: line.sourceId, name: line.sourceName || `采集源 ${line.sourceId}`, lines: 1 });
    }
    vodSources.value = { ...vodSources.value, [row.id]: [...map.values()] };
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '读取来源失败');
    vodSources.value = { ...vodSources.value, [row.id]: [] };
  } finally {
    if (sourcesLoading.value === row.id) sourcesLoading.value = '';
  }
}

async function recollect(row: VodRow, sourceId: string) {
  try {
    await api.post('/vod/recollect', { id: row.id, sourceId });
    ElMessage.success('已重新采集');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重新采集失败');
  }
}

async function onRecollectCommand(command: string) {
  const [vodId, sourceId] = command.split(':');
  const row = items.value.find((item) => item.id === vodId);
  if (row && sourceId && sourceId !== '0') await recollect(row, sourceId);
}

async function toggleStatus(row: VodRow) {
  const next = row.status === 1 ? 0 : 1;
  try {
    await api.post('/vod/batch', { ids: [row.id], action: 'status', status: next });
    ElMessage.success(next === 1 ? '已上架' : '已下架');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

async function remove(row: VodRow) {
  try {
    await ElMessageBox.confirm(
      `确定删除《${row.name}》吗？会同时删掉它的全部线路，不可恢复；只想前台不显示请用上/下架开关。`,
      '删除影片',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await api.del(`/vod/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

/* ------------------------------ 批量 ------------------------------ */

const categoryDialog = ref(false);
const batchCategory = ref<string | null>(null);

async function batchStatus(status: number) {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定把选中的 ${ids.length} 部影片${status === 1 ? '上架' : '下架'}吗？`,
      '批量操作',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await api.post('/vod/batch', { ids, action: 'status', status });
    ElMessage.success(status === 1 ? `已上架 ${ids.length} 部影片` : `已下架 ${ids.length} 部影片`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

function openCategoryDialog() {
  if (selection.value.length === 0) return;
  batchCategory.value = null;
  categoryDialog.value = true;
}

async function submitBatchCategory() {
  const ids = selection.value.map((row) => row.id);
  if (!batchCategory.value) return ElMessage.warning('请选择目标分类');
  try {
    await api.post('/vod/batch', { ids, action: 'category', categoryId: batchCategory.value });
    ElMessage.success(`已把 ${ids.length} 部影片改到新分类`);
    categoryDialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

onMounted(() => {
  void loadCategories();
  void load();
  if (wrapRef.value) {
    resizeObserver = new ResizeObserver(() => {
      tableHeight.value = wrapRef.value?.clientHeight ?? 400;
    });
    resizeObserver.observe(wrapRef.value);
    tableHeight.value = wrapRef.value.clientHeight;
  }
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
        placeholder="影片名称"
        clearable
        style="width: 200px"
        @keyup.enter="search"
      />
      <el-tree-select
        v-model="filters.category_id"
        :data="categories"
        :props="treeProps"
        node-key="id"
        placeholder="全部分类"
        check-strictly
        clearable
        filterable
        :render-after-expand="false"
        style="width: 200px"
      />
      <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 120px">
        <el-option label="已上架" value="1" />
        <el-option label="已下架" value="0" />
      </el-select>
      <el-select v-model="filters.sort" style="width: 140px">
        <el-option label="最近采集" value="time" />
        <el-option label="最新入库" value="new" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </div>
  </el-card>

  <el-card shadow="never" class="table-card">
    <div class="toolbar">
      <el-button :disabled="selection.length === 0" @click="openCategoryDialog">批量改分类</el-button>
      <el-button type="success" :disabled="selection.length === 0" @click="batchStatus(1)">批量上架</el-button>
      <el-button type="warning" :disabled="selection.length === 0" @click="batchStatus(0)">批量下架</el-button>
    </div>

    <div ref="wrapRef" class="table-wrap">
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="items"
      border
      stripe
      :height="tableHeight"
      empty-text="还没有影片，先去采集"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="44" fixed="left" />
      <el-table-column type="index" label="#" width="80" align="center" :index="rowIndex" />
      <el-table-column prop="name" label="影片" min-width="220" show-overflow-tooltip />
      <el-table-column label="分类" width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.categoryName">{{ row.categoryName }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="年份" width="80" align="center">
        <template #default="{ row }">{{ row.year || '—' }}</template>
      </el-table-column>
      <el-table-column label="线路" width="80" align="center">
        <template #default="{ row }">{{ row.plays }}</template>
      </el-table-column>
      <el-table-column label="集数" width="100" align="center">
        <template #default="{ row }">{{ row.episodes }} / {{ row.episodeCount || '—' }}</template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.status === 1" @change="toggleStatus(row)" />
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="165" align="center">
        <template #default="{ row }">{{ formatDateTime(row.collectedAt) || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="186" align="center" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button link type="primary" @click="edit(row)">编辑</el-button>
            <el-dropdown
              trigger="click"
              @command="onRecollectCommand"
              @visible-change="(open: boolean) => open && ensureSources(row)"
            >
              <el-button link type="primary">
                重采<el-icon class="caret"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="sourcesLoading === row.id" disabled>读取中…</el-dropdown-item>
                  <template v-else-if="(vodSources[row.id] ?? []).length > 0">
                    <el-dropdown-item
                      v-for="src in vodSources[row.id]"
                      :key="src.id"
                      :command="`${row.id}:${src.id}`"
                    >
                      {{ src.name }}
                    </el-dropdown-item>
                  </template>
                  <el-dropdown-item v-else disabled>没有可回溯的采集来源</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-pagination
      class="pager"
      layout="total, sizes, prev, pager, next"
      :total="total"
      :page-sizes="[20, 50, 100]"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
      @size-change="(size: number) => ((pageSize = size), search())"
    />

    <el-dialog v-model="categoryDialog" title="批量改分类" width="440px">
      <el-form label-width="90px">
        <el-form-item label="目标分类">
          <el-tree-select
            v-model="batchCategory"
            :data="categories"
            :props="treeProps"
            node-key="id"
            placeholder="请选择目标分类"
            check-strictly
            filterable
            :render-after-expand="false"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <div class="hint">共选中 {{ selection.length }} 部影片</div>
      <template #footer>
        <el-button @click="categoryDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBatchCategory">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
  </div>

  <VodEditDialog v-model="editVisible" :vod-id="editingId" @saved="load" />
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
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.row-actions :deep(.el-dropdown) {
  display: inline-flex;
  align-items: center;
}
.caret {
  margin-left: 2px;
  font-size: 12px;
}
</style>
