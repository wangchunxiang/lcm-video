<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface VodRow {
  id: number;
  name: string;
  categoryId: number;
  categoryPid: number;
  categoryName: string | null;
  year: number;
  remarks: string;
  status: number;
  episodeCount: number;
  playCount: number;
  collectedAt: string;
}

interface CategoryNode {
  id: number;
  pid: number;
  name: string;
  children?: CategoryNode[];
}

const router = useRouter();

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
  category_id: null as number | null,
  status: '',
  sort: 'time',
});

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;

const treeProps = { label: 'name', children: 'children' };

async function loadCategories() {
  try {
    const data = await api.get<{ items: CategoryNode[] }>('/categories');
    categories.value = data.items;
  } catch {
    categories.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value), sort: filters.sort });
    if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
    if (filters.category_id) params.set('category_id', String(filters.category_id));
    if (filters.status !== '') params.set('status', filters.status);
    const data = await api.get<{ items: VodRow[]; total: number }>(`/vods?${params.toString()}`);
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

function onPageChange(next: number) {
  page.value = next;
  void load();
}

function onSelectionChange(rows: VodRow[]) {
  selection.value = rows;
}

function edit(row: VodRow) {
  void router.push(`/content/vods/${row.id}`);
}

async function recollect(row: VodRow) {
  try {
    await api.post(`/vods/${row.id}/recollect`, {});
    ElMessage.success('已重新采集');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重新采集失败');
  }
}

async function toggleStatus(row: VodRow) {
  const next = row.status === 1 ? 0 : 1;
  try {
    await api.post('/vods/batch', { ids: [row.id], action: 'status', status: next });
    ElMessage.success(next === 1 ? '已上架' : '已下架');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

async function remove(row: VodRow) {
  try {
    await ElMessageBox.confirm(`确定下架《${row.name}》吗？下架后前台不再显示，影片仍在库里。`, '下架影片', {
      type: 'warning',
      confirmButtonText: '下架',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await api.del(`/vods/${row.id}`);
    ElMessage.success('已下架');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下架失败');
  }
}

/* ------------------------------ 批量 ------------------------------ */

const categoryDialog = ref(false);
const batchCategory = ref<number | null>(null);

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
    await api.post('/vods/batch', { ids, action: 'status', status });
    ElMessage.success(status === 1 ? `已上架 ${ids.length} 部影片` : `已下架 ${ids.length} 部影片`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function batchDelete() {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定下架选中的 ${ids.length} 部影片吗？下架后前台不再显示，影片仍在库里。`,
      '批量下架',
      { type: 'warning', confirmButtonText: '下架', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await api.post('/vods/batch', { ids, action: 'delete' });
    ElMessage.success(`已下架 ${ids.length} 部影片`);
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
    await api.post('/vods/batch', { ids, action: 'category', category_id: batchCategory.value });
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
        <el-option label="最近更新" value="time" />
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
      <el-button type="danger" :disabled="selection.length === 0" @click="batchDelete">批量删除</el-button>
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
      <el-table-column prop="id" label="#" width="80" align="center" />
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
      <el-table-column label="线路 / 集数" width="110" align="center">
        <template #default="{ row }">{{ row.playCount }} / {{ row.episodeCount }}</template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="160" show-overflow-tooltip />
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.status === 1" @change="toggleStatus(row)" />
        </template>
      </el-table-column>
      <el-table-column prop="collectedAt" label="更新时间" width="165" align="center" />
      <el-table-column label="操作" width="160" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="edit(row)">编辑</el-button>
          <el-button link type="primary" @click="recollect(row)">重采</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
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
</style>
