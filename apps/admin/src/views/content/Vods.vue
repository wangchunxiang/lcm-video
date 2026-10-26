<script setup lang="ts">
import { computed, onMounted, reactive, ref, onBeforeUnmount } from 'vue';
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
  area: string;
  lang: string;
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
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const selection = ref<VodRow[]>([]);
const categories = ref<CategoryNode[]>([]);

const filters = reactive({
  keyword: '',
  category_id: 0,
  status: '',
  sort: 'time',
});

const categoryProps = { value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false };
const flatCategories = computed(() => {
  const result: { id: number; label: string }[] = [];
  for (const parent of categories.value) {
    result.push({ id: parent.id, label: parent.name });
    for (const child of parent.children ?? []) result.push({ id: child.id, label: `${parent.name} / ${child.name}` });
  }
  return result;
});

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
    if (filters.category_id > 0) params.set('category_id', String(filters.category_id));
    if (filters.status !== '') params.set('status', filters.status);
    const data = await api.get<{ items: VodRow[]; total: number }>(`/vods?${params.toString()}`);
    items.value = data.items;
    total.value = data.total;
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
    await api.put(`/vods/${row.id}`, { ...row, status: next });
    ElMessage.success(next === 1 ? '已上架' : '已下架');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
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

const batchCategory = ref(0);

async function batch(action: 'category' | 'status' | 'delete', status?: number) {
  if (selection.value.length === 0) {
    ElMessage.warning('请先勾选影片');
    return;
  }
  if (action === 'category' && batchCategory.value === 0) {
    ElMessage.warning('请选择目标分类');
    return;
  }
  const label = action === 'category' ? '改分类' : action === 'status' ? (status === 1 ? '上架' : '下架') : '下架';
  try {
    await ElMessageBox.confirm(`确定把选中的 ${selection.value.length} 部影片${label}吗？`, '批量操作', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await api.post('/vods/batch', {
      ids: selection.value.map((row) => row.id),
      action,
      category_id: batchCategory.value,
      status,
    });
    ElMessage.success('操作完成');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

function onPageChange(value: number) {
  page.value = value;
  void load();
}

onMounted(async () => {
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
  <el-card shadow="never" class="fill-card">
    <div class="toolbar">
      <el-input v-model="filters.keyword" placeholder="影片名称" clearable style="width: 200px" @keyup.enter="search" />
      <el-select v-model="filters.category_id" placeholder="全部分类" clearable filterable style="width: 180px">
        <el-option v-for="item in flatCategories" :key="item.id" :label="item.label" :value="item.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 120px">
        <el-option label="已上架" value="1" />
        <el-option label="已下架" value="0" />
      </el-select>
      <el-select v-model="filters.sort" style="width: 140px">
        <el-option label="最近更新" value="time" />
        <el-option label="最新入库" value="new" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="batch-bar">
      <span class="selection-hint">已选 {{ selection.length }} 部</span>
      <el-select v-model="batchCategory" placeholder="目标分类" clearable filterable style="width: 180px">
        <el-option v-for="item in flatCategories" :key="item.id" :label="item.label" :value="item.id" />
      </el-select>
      <el-button :disabled="selection.length === 0" @click="batch('category')">批量改分类</el-button>
      <el-button :disabled="selection.length === 0" @click="batch('status', 1)">批量上架</el-button>
      <el-button :disabled="selection.length === 0" @click="batch('status', 0)">批量下架</el-button>
      <el-button type="danger" plain :disabled="selection.length === 0" @click="batch('delete')">批量删除</el-button>
      <span class="hint">「删除」等于下架，影片仍在库里</span>
    </div>

    <div ref="wrapRef" class="table-wrap">
    <el-table
      :height="tableHeight"
      v-loading="loading"
      :data="items"
      border
      stripe
      empty-text="还没有影片，先去采集"
      @selection-change="(rows: VodRow[]) => (selection = rows)"
    >
      <el-table-column type="selection" width="45" />
      <el-table-column prop="id" label="#" width="70" />
      <el-table-column prop="name" label="影片" min-width="200" show-overflow-tooltip />
      <el-table-column label="分类" width="160">
        <template #default="{ row }">{{ row.categoryName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="year" label="年份" width="80" align="center" />
      <el-table-column label="线路 / 集数" width="110" align="center">
        <template #default="{ row }">{{ row.playCount }} / {{ row.episodeCount }}</template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="140" show-overflow-tooltip />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? '已上架' : '已下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="collectedAt" label="更新时间" width="170" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="edit(row)">编辑</el-button>
          <el-button link type="primary" @click="recollect(row)">重新采集</el-button>
          <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '下架' : '上架' }}</el-button>
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
  </el-card>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
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
.batch-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}
.selection-hint {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
