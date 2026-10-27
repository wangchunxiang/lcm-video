<script setup lang="ts">
import { onMounted, reactive, ref, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, ApiError } from '../../api/client.ts';

interface CategoryNode {
  id: number;
  pid: number;
  name: string;
  alias: string;
  matchNames: string;
  sort: number;
  isShow: number;
  vodCount: number;
  children?: CategoryNode[];
}

const items = ref<CategoryNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref('新增分类');
const editingId = ref(0);

const form = reactive({
  pid: 0,
  name: '',
  alias: '',
  match_names: '',
  sort: 0,
  is_show: 1,
});

const filters = reactive({ keyword: '', is_show: '' });

async function load() {
  loading.value = true;
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.is_show) params.set('is_show', filters.is_show);
  try {
    const data = await api.get<{ items: CategoryNode[] }>(`/categories?${params.toString()}`);
    items.value = data.items.map((node) => ({
      ...node,
      children: node.children?.length
        ? node.children.map((child) => ({ ...child, children: undefined }))
        : undefined,
    }));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载分类失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  void load();
}

function reset() {
  filters.keyword = '';
  filters.is_show = '';
  void load();
}

function resetForm() {
  form.pid = 0;
  form.name = '';
  form.alias = '';
  form.match_names = '';
  form.sort = 0;
  form.is_show = 1;
  editingId.value = 0;
}

function openCreate(pid: number) {
  resetForm();
  form.pid = pid;
  dialogTitle.value = '新增分类';
  dialogVisible.value = true;
}

function openEdit(row: CategoryNode) {
  resetForm();
  editingId.value = row.id;
  form.pid = row.pid;
  form.name = row.name;
  form.alias = row.alias;
  form.match_names = row.matchNames;
  form.sort = row.sort;
  form.is_show = row.isShow;
  dialogTitle.value = '编辑分类';
  dialogVisible.value = true;
}

function toBody(row: CategoryNode, patch: Partial<Record<string, unknown>> = {}) {
  return {
    pid: row.pid,
    name: row.name,
    alias: row.alias,
    match_names: row.matchNames,
    sort: row.sort,
    is_show: row.isShow,
    ...patch,
  };
}

async function updateSort(row: CategoryNode, value: number | undefined) {
  if (value === undefined || value === row.sort) return;
  try {
    await api.put(`/categories/${row.id}`, toBody(row, { sort: value }));
    row.sort = value;
    ElMessage.success('排序已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

async function toggleShow(row: CategoryNode) {
  const next = row.isShow === 1 ? 0 : 1;
  try {
    await api.put(`/categories/${row.id}`, toBody(row, { is_show: next }));
    ElMessage.success(next === 1 ? '已设为显示' : '已设为隐藏');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

async function submit() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写分类名称');
    return;
  }
  if (!form.alias.trim()) {
    ElMessage.warning('请填写 URL 别名');
    return;
  }

  const payload = {
    pid: form.pid,
    name: form.name.trim(),
    alias: form.alias.trim(),
    match_names: form.match_names.trim(),
    sort: form.sort,
    is_show: form.is_show,
  };

  saving.value = true;
  try {
    if (editingId.value > 0) {
      await api.put(`/categories/${editingId.value}`, payload);
      ElMessage.success('已保存');
    } else {
      await api.post('/categories', payload);
      ElMessage.success('已创建');
    }
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(row: CategoryNode) {
  try {
    await ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, '确认删除', { type: 'warning' });
  } catch {
    return;
  }

  try {
    await api.del(`/categories/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    if (error instanceof ApiError && error.code === 40900) {
      try {
        await ElMessageBox.confirm(error.message, '确认删除', { type: 'warning' });
      } catch {
        return;
      }
      try {
        await api.del(`/categories/${row.id}`, { force: '1' });
        ElMessage.success('已删除');
        await load();
      } catch (retryError) {
        ElMessage.error(retryError instanceof Error ? retryError.message : '删除失败');
      }
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
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
          placeholder="分类名称 / 别名"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-select v-model="filters.is_show" placeholder="全部状态" clearable style="width: 120px">
          <el-option label="显示" value="1" />
          <el-option label="隐藏" value="0" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button type="primary" style="margin-left: auto" @click="openCreate(0)">新增分类</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div ref="wrapRef" class="table-wrap">
        <el-table
          :height="tableHeight"
          v-loading="loading"
          :data="items"
          row-key="id"
          default-expand-all
          :tree-props="{ children: 'children' }"
          border
        >
          <el-table-column prop="name" label="分类名称" min-width="180" />
          <el-table-column prop="alias" label="URL 别名" min-width="140" />
          <el-table-column label="匹配名" min-width="200">
            <template #default="{ row }">
              <span class="match">{{ row.matchNames || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="排序" width="110" align="center">
            <template #default="{ row }">
              <el-input-number
                :model-value="row.sort"
                :min="0"
                :max="9999"
                size="small"
                controls-position="right"
                style="width: 88px"
                @change="(value: number | undefined) => updateSort(row, value)"
              />
            </template>
          </el-table-column>
          <el-table-column label="显示" width="80" align="center">
            <template #default="{ row }">
              <el-switch :model-value="row.isShow === 1" @change="toggleShow(row)" />
            </template>
          </el-table-column>
          <el-table-column prop="vodCount" label="影片数" width="90" align="center" />
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px">
      <el-form label-width="100px">
        <el-form-item label="父分类">
          <el-select v-model="form.pid" style="width: 100%">
            <el-option label="无（作为一级分类）" :value="0" />
            <el-option v-for="item in items" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：动作片" />
        </el-form-item>
        <el-form-item label="URL 别名" required>
          <el-input v-model="form.alias" maxlength="50" placeholder="小写字母、数字、减号，如 huayudongzuo" />
        </el-form-item>
        <el-form-item label="匹配名">
          <el-input v-model="form.match_names" maxlength="255" placeholder="源站分类名，英文逗号分隔" />
          <div class="hint">采集时优先用这里的名字自动匹配源站分类，其次用分类名本身。</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="前台显示">
          <el-switch v-model="form.is_show" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search-card,
.table-card :deep(.el-card__body) {
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
.search-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.match {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
