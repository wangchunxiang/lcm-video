<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { TableInstance } from 'element-plus';
import { computed } from 'vue';
import { describeCron, isValidCron, nextRunAt, WEEK_LABELS } from '@lcm/shared/cron';
import { buildListQuery } from '@lcm/api-client';
import { api } from '../../api/client.ts';
import CronEditor from '../../components/CronEditor.vue';

interface TaskRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  name: string;
  sourceId: string;
  /** 服务端不返回，前端按 sources 表补 */
  sourceName: string | null;
  rangeType: number;
  cron: string;
  isEnabled: number;
  lastRunAt: string | null;
  lastRunStatus: number;
  lastRunMsg: string;
  /** 派生：lastRunStatus === 1 视为运行中 */
  runningLogId: string | null;
  /** 派生：按 cron 现算下一次执行时间 */
  nextRunAt: string | null;
}

interface SourceRow {
  id: string;
  name: string;
}

const items = ref<TaskRow[]>([]);
const sources = ref<SourceRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const dialogVisible = ref(false);
const dialogTitle = ref('新增采集任务');
const editingId = ref('');
const tableRef = ref<TableInstance>();
const selection = ref<TaskRow[]>([]);
let timer: ReturnType<typeof setInterval> | undefined;

const filters = reactive({
  keyword: '',
  source_id: '',
  status: '',
});

const rangeOptions = [
  { value: 1, label: '本日更新' },
  { value: 2, label: '本周更新' },
  { value: 3, label: '本月更新' },
  { value: 4, label: '全部影片' },
];

const form = reactive({
  name: '',
  source_id: '',
  range_type: 1,
  cron: '',
  is_enabled: 1,
});

function decorate(rows: TaskRow[]): TaskRow[] {
  const nameById = new Map(sources.value.map((item) => [item.id, item.name]));
  const now = new Date();
  return rows.map((row) => ({
    ...row,
    sourceName: nameById.get(row.sourceId) ?? null,
    runningLogId: row.lastRunStatus === 1 ? row.id : null,
    nextRunAt: row.cron && isValidCron(row.cron) === null ? formatRunTime(nextRunAt(row.cron, now) ?? now) : null,
  }));
}

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const where: Record<string, unknown> = {};
    const keyword = filters.keyword.trim();
    if (keyword) where['name'] = { $like: `%${keyword}%` };
    if (filters.source_id !== '') where['sourceId'] = filters.source_id;
    if (filters.status !== '') where['isEnabled'] = Number(filters.status);
    const data = await api.get<{ items: TaskRow[]; total: number }>(
      '/collect-task',
      buildListQuery({
        take: pageSize.value,
        skip: (page.value - 1) * pageSize.value,
        where,
        order: { id: 'ASC' },
      }),
    );
    items.value = decorate(data.items);
    total.value = data.total;
    if (items.value.length === 0 && page.value > 1) {
      page.value -= 1;
      await load(silent);
    }
  } catch (error) {
    if (!silent) ElMessage.error(error instanceof Error ? error.message : '加载任务失败');
  } finally {
    if (!silent) loading.value = false;
  }
}

async function loadSources() {
  try {
    const data = await api.get<{ items: SourceRow[] }>('/collect-source', buildListQuery({ take: 100 }));
    sources.value = data.items;
  } catch {
    sources.value = [];
  }
}

function search() {
  page.value = 1;
  void load();
}

function onPageChange(current: number) {
  page.value = current;
  void load();
}

function reset() {
  filters.keyword = '';
  filters.source_id = '';
  filters.status = '';
  search();
}

function onSelectionChange(rows: TaskRow[]) {
  selection.value = rows;
}

function resetForm() {
  form.name = '';
  form.source_id = sources.value[0]?.id ?? '';
  form.range_type = 1;
  form.cron = '';
  form.is_enabled = 1;
  editingId.value = '';
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

function payload() {
  return {
    name: form.name.trim(),
    sourceId: form.source_id,
    rangeType: form.range_type,
    cron: form.cron.trim(),
    isEnabled: form.is_enabled,
  };
}

async function submit() {
  if (!form.name.trim()) return ElMessage.warning('请填写任务名称');
  if (form.source_id === '') return ElMessage.warning('请选择采集源');

  try {
    if (editingId.value !== '') {
      await api.put(`/collect-task/${editingId.value}`, payload());
    } else {
      await api.post('/collect-task', payload());
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

function toBody(row: TaskRow, patch: Partial<Record<string, unknown>> = {}) {
  return {
    name: row.name,
    sourceId: row.sourceId,
    rangeType: row.rangeType,
    cron: row.cron,
    isEnabled: row.isEnabled,
    ...patch,
  };
}

async function toggleStatus(row: TaskRow) {
  const next = row.isEnabled === 1 ? 0 : 1;
  try {
    await api.put(`/collect-task/${row.id}`, toBody(row, { isEnabled: next }));
    ElMessage.success(next === 1 ? '已启用' : '已停用');
    await load(true);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load(true);
  }
}

async function run(row: TaskRow) {
  try {
    const data = await api.post<{ ok: boolean; logId?: string; msg?: string }>('/collect-task/run', {
      id: row.id,
    });
    if (data.ok) {
      ElMessage.success(`已开始采集，记录 #${data.logId ?? '-'}`);
    } else {
      ElMessage.warning(data.msg || '未能开始采集');
    }
    await load(true);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '启动失败');
  }
}

async function cancel(row: TaskRow) {
  try {
    await api.post('/collect-task/cancel', { id: row.id });
    ElMessage.success('已发出取消指令，当前页结束后停止');
    await load(true);
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
    await api.del(`/collect-task/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

/** 批量启用/停用：v3 没有批量动作接口，逐个 PUT。 */
async function batchStatus(action: 'enable' | 'disable') {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  const isEnabled = action === 'enable' ? 1 : 0;
  try {
    for (const id of ids) {
      await api.put(`/collect-task/${id}`, { isEnabled });
    }
    ElMessage.success(action === 'enable' ? `已启用 ${ids.length} 个任务` : `已停用 ${ids.length} 个任务`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function confirmBatchDelete() {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个任务吗？`, '批量删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await api.del('/collect-task/delete/bulk', { ids: ids.join(',') });
    ElMessage.success(`已删除 ${ids.length} 个任务`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

function rangeLabel(value: number): string {
  return rangeOptions.find((item) => item.value === value)?.label ?? String(value);
}

/** v3 任务状态：0 未运行 / 1 运行中 / 2 成功 / 3 失败 / 4 已取消 */
function runStatus(row: TaskRow): { text: string; type: 'success' | 'danger' | 'info' | 'warning' } {
  if (row.lastRunStatus === 1) return { text: '运行中', type: 'warning' };
  if (row.lastRunStatus === 2) return { text: '成功', type: 'success' };
  if (row.lastRunStatus === 3) return { text: '失败', type: 'danger' };
  if (row.lastRunStatus === 4) return { text: '已取消', type: 'info' };
  return { text: '未执行', type: 'info' };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatRunTime(date: Date): string {
  const week = WEEK_LABELS.find((item) => item.value === date.getDay())?.label ?? '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${week} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatRelative(date: Date, now: Date): string {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60000);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时后`;
  return `${Math.round(hours / 24)} 天后`;
}

const cronError = computed(() => {
  const expr = form.cron.trim();
  return expr ? isValidCron(expr) : null;
});

const cronHint = computed(() => {
  const expr = form.cron.trim();
  if (!expr) return '留空表示只能手动执行';
  if (cronError.value) return cronError.value;
  return describeCron(expr);
});

const nextRun = computed(() => {
  const expr = form.cron.trim();
  if (!expr || isValidCron(expr) !== null) return null;
  const now = new Date();
  const next = nextRunAt(expr, now);
  if (!next) return null;
  return { text: formatRunTime(next), relative: formatRelative(next, now) };
});

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await loadSources();
  await load();
  timer = setInterval(() => {
    if (!dialogVisible.value) void load(true);
  }, 5000);
});

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

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="search-card">
      <div class="search-bar">
        <el-input
          v-model="filters.keyword"
          placeholder="任务名称"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-select v-model="filters.source_id" placeholder="全部采集源" clearable style="width: 160px">
          <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="String(item.id)" />
        </el-select>
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
        <el-button type="primary" @click="openCreate">新增任务</el-button>
        <el-button type="success" :disabled="selection.length === 0" @click="batchStatus('enable')">批量启用</el-button>
        <el-button type="warning" :disabled="selection.length === 0" @click="batchStatus('disable')">批量停用</el-button>
        <el-button type="danger" :disabled="selection.length === 0" @click="confirmBatchDelete">批量删除</el-button>
        <span class="hint">列表每 5 秒自动刷新</span>
      </div>

      <div ref="wrapRef" class="table-wrap">
        <el-table
          ref="tableRef"
          v-loading="loading"
          :data="items"
          border
          stripe
          :height="tableHeight"
          empty-text="还没有采集任务"
          @selection-change="onSelectionChange"
        >
          <el-table-column type="selection" width="44" fixed="left" />
          <el-table-column prop="name" label="任务名称" min-width="140" show-overflow-tooltip />
          <el-table-column prop="sourceName" label="采集源" width="140" show-overflow-tooltip />
          <el-table-column label="采集范围" width="110" align="center">
            <template #default="{ row }">{{ rangeLabel(row.rangeType) }}</template>
          </el-table-column>
          <el-table-column label="定时" width="150" align="center">
            <template #default="{ row }">
              <span v-if="row.cron" :title="row.cron">{{ describeCron(row.cron) }}</span>
              <span v-else class="muted">仅手动</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-switch :model-value="row.isEnabled === 1" @change="toggleStatus(row)" />
            </template>
          </el-table-column>
          <el-table-column label="执行状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.lastRunStatus === 1" type="primary" size="small" effect="light">运行中</el-tag>
              <span v-else class="muted">空闲</span>
            </template>
          </el-table-column>
          <el-table-column label="上次执行" width="165" align="center">
            <template #default="{ row }">
              <span v-if="row.lastRunAt">{{ row.lastRunAt }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="结果" width="90" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="runStatus(row).type">{{ runStatus(row).text }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.lastRunMsg">{{ row.lastRunMsg }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="下次执行" width="165" align="center">
            <template #default="{ row }">
              <span v-if="row.nextRunAt">{{ row.nextRunAt }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.lastRunStatus !== 1" link type="primary" @click="run(row)">执行</el-button>
              <el-button v-else link type="warning" @click="cancel(row)">取消</el-button>
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
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

      <el-dialog v-model="dialogVisible" :title="dialogTitle" width="660px" destroy-on-close>
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
            <el-input v-model="form.cron" class="cron-input" placeholder="留空表示只能手动执行，如 0 3 * * *" />
            <div class="hint" :class="{ 'hint-error': cronError }">{{ cronHint }}</div>
          </el-form-item>
          <el-form-item label="定时可视化">
            <CronEditor v-model="form.cron" />
          </el-form-item>
          <el-form-item label="下次执行">
            <div v-if="nextRun" class="runs">
              <span class="run">{{ nextRun.text }}<span class="relative">{{ nextRun.relative }}</span></span>
            </div>
            <span v-else-if="!form.cron.trim()" class="muted">留空表示只能手动执行</span>
            <span v-else class="muted">表达式无效，无法计算下次执行时间</span>
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
  gap: 12px;
}
.search-card,
.table-card {
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
  flex: none;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.table-wrap {
  flex: 1;
  min-height: 0;
}
.pager {
  flex: none;
  margin-top: 12px;
  justify-content: flex-end;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.hint-error {
  color: var(--el-color-danger);
}
.toolbar .hint {
  margin-left: auto;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.cron-input :deep(.el-input__inner) {
  font-family: Consolas, Monaco, monospace;
}
.runs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.run {
  color: var(--el-text-color-regular);
  font-family: Consolas, Monaco, monospace;
}
.relative {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-family: inherit;
}
</style>
