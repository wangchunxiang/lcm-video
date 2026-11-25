<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';
import ProTable from '../../components/ProTable.vue';

interface CategoryNode {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  pid: string;
  name: string;
  alias: string;
  matchNames: string;
  sort: number;
  isShow: number;
  children?: CategoryNode[];
}

const items = ref<CategoryNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editingId = ref('');

/** 标题由 `editingId` 现算，不再另存一个 ref 手动赋两次 */
const dialogTitle = computed(() => (editingId.value === '' ? '新增分类' : '编辑分类'));

interface CategoryForm {
  pid: string;
  name: string;
  alias: string;
  matchNames: string;
  sort: number;
  isShow: number;
}

/** 表单初值只写一份：`reactive` 的初始值和「新增」时的重置都从这里取 */
const DEFAULTS: CategoryForm = { pid: '0', name: '', alias: '', matchNames: '', sort: 0, isShow: 1 };

const form = reactive<CategoryForm>({ ...DEFAULTS });

const filters = reactive({ keyword: '', isShow: '' });

/** 父分类下拉：只有一级分类能当父级（服务端也这么限制）。 */
const topOptions = computed(() => items.value.map((item) => ({ id: item.id, name: item.name })));

/** v3 的 tree 接口不带筛选参数，关键词与显示状态在前端过滤（分类总共几十条）。 */
const visible = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  const wantShow = filters.isShow === '' ? null : Number(filters.isShow);
  const keep = (node: CategoryNode): boolean => {
    const hitKeyword =
      !keyword || node.name.toLowerCase().includes(keyword) || node.alias.toLowerCase().includes(keyword);
    const hitShow = wantShow === null || node.isShow === wantShow;
    return hitKeyword && hitShow;
  };

  return items.value
    .map((top): CategoryNode | null => {
      const children = (top.children ?? []).filter(keep);
      return keep(top) || children.length > 0 ? { ...top, children } : null;
    })
    .filter((node): node is CategoryNode => node !== null);
});

async function load() {
  loading.value = true;
  try {
    items.value = await api.post<CategoryNode[]>('/category/tree');
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
  filters.isShow = '';
  void load();
}

function resetForm() {
  Object.assign(form, DEFAULTS);
  editingId.value = '';
}

function openCreate(pid: string) {
  resetForm();
  form.pid = pid;
  dialogVisible.value = true;
}

function openEdit(row: CategoryNode) {
  resetForm();
  editingId.value = row.id;
  form.pid = row.pid;
  form.name = row.name;
  form.alias = row.alias;
  form.matchNames = row.matchNames;
  form.sort = row.sort;
  form.isShow = row.isShow;
  dialogVisible.value = true;
}

async function toggleShow(row: CategoryNode) {
  const next = row.isShow === 1 ? 0 : 1;
  try {
    await api.put(`/category/${row.id}`, { isShow: next });
    ElMessage.success(next === 1 ? '已设为显示' : '已设为隐藏');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  } finally {
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
    matchNames: form.matchNames.trim(),
    sort: form.sort,
    isShow: form.isShow,
  };

  saving.value = true;
  try {
    if (editingId.value !== '') {
      await api.put(`/category/${editingId.value}`, payload);
      ElMessage.success('已保存');
    } else {
      await api.post('/category', payload);
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
    // 有子分类或分类下有影片时，服务端会拒绝并给出原因
    await api.del(`/category/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(load);
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
        <el-select v-model="filters.isShow" placeholder="全部状态" clearable style="width: 120px">
          <el-option label="显示" value="1" />
          <el-option label="隐藏" value="0" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button type="primary" style="margin-left: auto" @click="openCreate('0')">新增分类</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <ProTable
        :data="visible"
        :loading="loading"
        :show-pager="false"
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
              <el-switch :model-value="row.isShow === 1" @change="toggleShow(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
      </ProTable>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px">
      <el-form label-width="100px">
        <el-form-item label="父分类">
          <el-select v-model="form.pid" style="width: 100%">
            <el-option label="无（作为一级分类）" value="0" />
            <el-option v-for="item in topOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：动作片" />
        </el-form-item>
        <el-form-item label="URL 别名" required>
          <el-input v-model="form.alias" maxlength="50" placeholder="小写字母、数字、减号，如 huayudongzuo" />
        </el-form-item>
        <el-form-item label="匹配名">
          <el-input v-model="form.matchNames" maxlength="255" placeholder="源站分类名，英文逗号分隔" />
          <div class="hint">采集时优先用这里的名字自动匹配源站分类，其次用分类名本身。</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="前台显示">
          <el-switch v-model="form.isShow" :active-value="1" :inactive-value="0" />
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
