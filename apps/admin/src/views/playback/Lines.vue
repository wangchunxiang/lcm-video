<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';
import ProTable from '../../components/ProTable.vue';
import { buildListQuery } from '@lcm/api-client';

interface LineItem {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  sourceFrom: string;
  name: string;
  sort: number;
  isEnabled: number;
  sourceName: string;
}

const loading = ref(false);
const items = ref<LineItem[]>([]);
const total = ref(0);
const selection = ref<LineItem[]>([]);

const filters = reactive({ keyword: '', status: '' });
const pager = reactive({ page: 1, page_size: 20 });

async function load() {
  loading.value = true;
  const where: Record<string, unknown> = {};
  const keyword = filters.keyword.trim();
  if (keyword) {
    where['$or'] = [{ sourceFrom: { $like: `%${keyword}%` } }, { name: { $like: `%${keyword}%` } }];
  }
  if (filters.status !== '') where['isEnabled'] = Number(filters.status);
  try {
    const data = await api.get<{ items: LineItem[]; total: number }>(
      '/play-line',
      buildListQuery({
        take: pager.page_size,
        skip: (pager.page - 1) * pager.page_size,
        where,
        order: { sort: 'ASC', id: 'ASC' },
      }),
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

function onSelectionChange(rows: LineItem[]): void {
  selection.value = rows;
}

async function patch(row: LineItem, body: Record<string, unknown>) {
  try {
    await api.put(`/play-line/${row.id}`, body);
    ElMessage.success('已保存');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
    await load();
  }
}

const editVisible = ref(false);
const editSaving = ref(false);
const editForm = reactive({ id: '', sourceFrom: '', name: '', isEnabled: 1 });

function openEdit(row: LineItem) {
  editForm.id = row.id;
  editForm.sourceFrom = row.sourceFrom;
  editForm.name = row.name;
  editForm.isEnabled = row.isEnabled;
  editVisible.value = true;
}

async function saveEdit() {
  if (editForm.name.trim().length > 50) {
    ElMessage.warning('显示名不能超过 50 个字符');
    return;
  }
  editSaving.value = true;
  try {
    await api.put(`/play-line/${editForm.id}`, {
      name: editForm.name.trim(),
      isEnabled: editForm.isEnabled,
    });
    ElMessage.success('已保存');
    editVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    editSaving.value = false;
  }
}

async function remove(row: LineItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除线路「${row.sourceFrom}」的配置吗？已采集的线路数据不受影响，下次采集会重新登记。`,
      '删除线路',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await api.del(`/play-line/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

function toggleStatus(row: LineItem) {
  void patch(row, { isEnabled: row.isEnabled });
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
    await api.post('/play-line/switch', { ids: selection.value.map((row) => row.id), isEnabled: action === 'enable' ? 1 : 0 });
    ElMessage.success(`已${label}`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : `${label}失败`);
  }
}

const sortVisible = ref(false);
const sortSaving = ref(false);
const sortList = ref<{ id: string; sourceFrom: string; name: string }[]>([]);
const dragIndex = ref(-1);

async function openSort() {
  try {
    const data = await api.get<{ items: LineItem[] }>('/play-line', buildListQuery({ take: 100, order: { sort: 'ASC', id: 'ASC' } }));
    sortList.value = data.items.map((row) => ({
      id: row.id,
      sourceFrom: row.sourceFrom,
      name: row.name || row.sourceName || row.sourceFrom,
    }));
    sortVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载线路失败');
  }
}

function startDrag(index: number) {
  dragIndex.value = index;
}

function dragOver(index: number) {
  if (dragIndex.value < 0 || dragIndex.value === index) return;
  const items = sortList.value;
  const [moved] = items.splice(dragIndex.value, 1);
  if (!moved) return;
  items.splice(index, 0, moved);
  dragIndex.value = index;
}

function endDrag() {
  dragIndex.value = -1;
}

async function saveSortOrder() {
  sortSaving.value = true;
  try {
    await api.post('/play-line/sort', { ids: sortList.value.map((row) => row.id) });
    ElMessage.success('排序已保存');
    sortVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    sortSaving.value = false;
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
        <el-button type="success" :disabled="selection.length === 0" @click="batch('enable')">批量启用</el-button>
        <el-button type="warning" :disabled="selection.length === 0" @click="batch('disable')">批量停用</el-button>
        <el-button @click="openSort">调整排序</el-button>
      </div>
      <ProTable
        :data="items"
        :total="total"
        :page="pager.page"
        :page-size="pager.page_size"
        :loading="loading"
        row-key="id"
        border
        stripe
        @update:page="changePage"
        @update:page-size="changePageSize"
        @selection-change="(rows) => onSelectionChange(rows as LineItem[])"
      >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="sourceFrom" label="线路标识" min-width="180">
            <template #default="{ row }">
              <span class="code">{{ row.sourceFrom }}</span>
            </template>
          </el-table-column>
          <el-table-column label="显示名" min-width="220">
            <template #default="{ row }">
              <span>{{ row.name || row.sourceName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="来源" min-width="140">
            <template #default="{ row }">
              <span v-if="row.sourceName">{{ row.sourceName }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="sort" label="排序" width="90" align="center" />
          <el-table-column label="操作" width="120" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
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
      </ProTable>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑线路" width="480px">
      <el-form label-width="80px">
        <el-form-item label="线路标识">
          <span class="code">{{ editForm.sourceFrom }}</span>
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="editForm.name" maxlength="50" placeholder="留空则用采集源名称" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="editForm.isEnabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="sortVisible" title="调整线路排序" width="520px">
      <div class="sort-tip">拖动调整顺序，越靠前越优先，前台播放页按此顺序排列线路。</div>
      <div class="sort-list">
        <div
          v-for="(item, index) in sortList"
          :key="item.id"
          class="sort-row"
          :class="{ 'is-dragging': dragIndex === index }"
          draggable="true"
          @dragstart="startDrag(index)"
          @dragover.prevent="dragOver(index)"
          @dragend="endDrag"
        >
          <span class="sort-index">{{ index + 1 }}</span>
          <span class="sort-name">{{ item.name }}</span>
          <span class="sort-code">{{ item.sourceFrom }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="sortVisible = false">取消</el-button>
        <el-button type="primary" :loading="sortSaving" @click="saveSortOrder">保存</el-button>
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
.search-bar {
  display: flex;
  align-items: center;
}
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.sort-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}
.sort-list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.sort-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  cursor: move;
  background: var(--el-bg-color);
}
.sort-row + .sort-row {
  border-top: 1px solid var(--el-border-color-lighter);
}
.sort-row:hover {
  background: var(--el-fill-color-light);
}
.sort-row.is-dragging {
  opacity: 0.5;
}
.sort-index {
  width: 18px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.sort-name {
  flex: none;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sort-code {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
