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

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: CategoryNode[] }>('/categories');
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
  dialogTitle.value = pid > 0 ? '新增子分类' : '新增一级分类';
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
  <el-card shadow="never" class="fill-card">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate(0)">新增一级分类</el-button>
      <span class="tip">分类最多两级；二级分类通过「类型」参数在一级分类页里筛选</span>
    </div>

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
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column label="显示" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isShow === 1 ? 'success' : 'info'" size="small">
            {{ row.isShow === 1 ? '显示' : '隐藏' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="vodCount" label="影片数" width="90" align="center" />
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.pid === 0" link type="primary" @click="openCreate(row.id)">加子分类</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px">
      <el-form label-width="100px">
        <el-form-item label="父分类">
          <span>{{ form.pid === 0 ? '（无，作为一级分类）' : items.find((item) => item.id === form.pid)?.name ?? '—' }}</span>
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
.tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
