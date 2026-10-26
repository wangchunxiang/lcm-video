<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface TaskRow {
  id: number;
  name: string;
  sourceId: number;
  sourceName: string | null;
  rangeType: number;
  cron: string;
  isEnabled: number;
  lastRunAt: string | null;
  lastRunStatus: number;
  lastRunMsg: string;
  runningLogId: number | null;
}

interface SourceRow {
  id: number;
  name: string;
}

const items = ref<TaskRow[]>([]);
const sources = ref<SourceRow[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref('新增采集任务');
const editingId = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

const rangeOptions = [
  { value: 1, label: '本日更新' },
  { value: 2, label: '本周更新' },
  { value: 3, label: '本月更新' },
  { value: 4, label: '全部影片' },
];

const form = reactive({
  name: '',
  source_id: 0,
  range_type: 1,
  cron: '',
  is_enabled: 1,
});

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{ items: TaskRow[] }>('/tasks');
    items.value = data.items;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载任务失败');
  } finally {
    loading.value = false;
  }
}

async function loadSources() {
  try {
    const data = await api.get<{ items: SourceRow[] }>('/sources');
    sources.value = data.items;
  } catch {
    sources.value = [];
  }
}

function resetForm() {
  form.name = '';
  form.source_id = sources.value[0]?.id ?? 0;
  form.range_type = 1;
  form.cron = '';
  form.is_enabled = 1;
  editingId.value = 0;
}

function openCreate() {
  resetForm();
  dialogTitle.value = '新增采集任务';
  dialogVisible.value = true;
}

function openEdit(row: TaskRow) {
  resetForm();
  editingId.value = row.id;
  form.name = row.name;
  form.source_id = row.sourceId;
  form.range_type = row.rangeType;
  form.cron = row.cron;
  form.is_enabled = row.isEnabled;
  dialogTitle.value = '编辑采集任务';
  dialogVisible.value = true;
}

async function submit() {
  if (!form.name.trim()) return ElMessage.warning('请填写任务名称');
  if (form.source_id <= 0) return ElMessage.warning('请选择采集源');

  try {
    if (editingId.value > 0) {
      await api.put(`/tasks/${editingId.value}`, form);
    } else {
      await api.post('/tasks', form);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

async function run(row: TaskRow) {
  try {
    const data = await api.post<{ logId: number }>(`/tasks/${row.id}/run`);
    ElMessage.success(`已开始采集，记录 #${data.logId}`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '启动失败');
  }
}

async function cancel(row: TaskRow) {
  try {
    await api.post(`/tasks/${row.id}/cancel`);
    ElMessage.success('已发出取消指令，当前页结束后停止');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '取消失败');
  }
}

async function remove(row: TaskRow) {
  try {
    await ElMessageBox.confirm(`确定删除任务「${row.name}」吗？`, '删除任务', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await api.del(`/tasks/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

function rangeLabel(value: number): string {
  return rangeOptions.find((item) => item.value === value)?.label ?? String(value);
}

function runStatus(row: TaskRow): { text: string; type: 'success' | 'danger' | 'info' | 'warning' } {
  if (row.runningLogId !== null) return { text: '运行中', type: 'warning' };
  if (row.lastRunStatus === 1) return { text: '成功', type: 'success' };
  if (row.lastRunStatus === 2) return { text: '失败', type: 'danger' };
  if (row.lastRunStatus === 3) return { text: '已取消', type: 'info' };
  return { text: '未执行', type: 'info' };
}

onMounted(async () => {
  await loadSources();
  await load();
  timer = setInterval(load, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
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
      <el-button type="primary" @click="openCreate">新增任务</el-button>
      <el-button :loading="loading" @click="load">刷新</el-button>
      <span class="hint">列表每 5 秒自动刷新；同一采集源同一时间只运行一个任务</span>
    </div>

    <div ref="wrapRef" class="table-wrap">
    <el-table :height="tableHeight" v-loading="loading" :data="items" border stripe empty-text="还没有采集任务">
      <el-table-column prop="name" label="任务名称" width="160" show-overflow-tooltip />
      <el-table-column prop="sourceName" label="采集源" width="140" show-overflow-tooltip />
      <el-table-column label="采集范围" width="110" align="center">
        <template #default="{ row }">{{ rangeLabel(row.rangeType) }}</template>
      </el-table-column>
      <el-table-column label="定时" width="150">
        <template #default="{ row }">
          <code v-if="row.cron">{{ row.cron }}</code>
          <span v-else class="muted">仅手动</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isEnabled === 1 ? 'success' : 'info'" size="small">
            {{ row.isEnabled === 1 ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="上次执行" width="190">
        <template #default="{ row }">
          <div>{{ row.lastRunAt || '—' }}</div>
          <div class="muted">{{ runStatus(row).text }}<template v-if="row.lastRunMsg"> · {{ row.lastRunMsg }}</template></div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.runningLogId === null" link type="primary" @click="run(row)">执行</el-button>
          <el-button v-else link type="warning" @click="cancel(row)">取消</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="任务名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：西瓜资源每日更新" />
        </el-form-item>
        <el-form-item label="采集源" required>
          <el-select v-model="form.source_id" placeholder="选择采集源" style="width: 100%">
            <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="采集范围">
          <el-radio-group v-model="form.range_type">
            <el-radio v-for="item in rangeOptions" :key="item.value" :value="item.value">{{ item.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="定时表达式">
          <el-input v-model="form.cron" placeholder="留空表示只能手动执行，如 0 3 * * *" />
          <div class="hint">五段式「分 时 日 月 周」，按 Asia/Shanghai 时区；如 0 3 * * * 表示每天 3 点</div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
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
  margin-bottom: 12px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
