<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { TagProps } from 'element-plus';
import { api } from '../../api/client.ts';

interface LogRow {
  id: number;
  taskId: number;
  taskName: string | null;
  sourceId: number;
  sourceName: string | null;
  status: number;
  totalPages: number;
  resumeCount: number;
  interruptedMs: number;
  lastPage: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  message: string;
  startedAt: string;
  finishedAt: string | null;
}

interface DetailRow {
  id: number;
  page: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  failDetail: { vod_id?: string; name?: string; reason?: string }[] | null;
  message: string;
}

interface SourceRow {
  id: number;
  name: string;
}

const items = ref<LogRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const filters = reactive({ status: '', source_id: '' });
const sources = ref<SourceRow[]>([]);

const drawerVisible = ref(false);
const currentLog = ref<LogRow | null>(null);
const details = ref<DetailRow[]>([]);
const detailTotal = ref(0);
const detailPage = ref(1);
const detailPageSize = ref(20);
const detailLoading = ref(false);

let timer: ReturnType<typeof setInterval> | undefined;
const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
const detailWrapRef = ref<HTMLElement | null>(null);
const detailTableHeight = ref(300);
let resizeObserver: ResizeObserver | null = null;

type NumKind = 'total' | 'inserted' | 'updated' | 'skipped' | 'ignored' | 'failed';

function numClass(kind: NumKind): string {
  return `num num-${kind}`;
}

function statusOf(row: { status: number }): { text: string; type: TagProps['type'] } {
  if (row.status === 0) return { text: '进行中', type: 'warning' };
  if (row.status === 1) return { text: '成功', type: 'success' };
  if (row.status === 2) return { text: '失败', type: 'danger' };
  return { text: '已取消', type: 'info' };
}

const nowTick = ref(Date.now());

/** 固定「X 时 X 分 X 秒」格式，避免执行中文字宽度变化导致页面抖动 */
function elapsedText(startText: string, endText: string | null): string {
  const start = new Date(startText.replace(' ', 'T')).getTime();
  const end = endText ? new Date(endText.replace(' ', 'T')).getTime() : nowTick.value;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} 时 ${minutes} 分 ${seconds % 60} 秒`;
}

function durationText(row: LogRow): string {
  return elapsedText(row.startedAt, row.finishedAt);
}

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value) });
    if (filters.status !== '') params.set('status', filters.status);
    if (filters.source_id !== '') params.set('source_id', filters.source_id);
    const data = await api.get<{ items: LogRow[]; total: number }>(`/logs?${params.toString()}`);
    items.value = data.items;
    total.value = data.total;
    if (items.value.length === 0 && page.value > 1) {
      page.value -= 1;
      await load(silent);
    }
  } catch (error) {
    if (!silent) ElMessage.error(error instanceof Error ? error.message : '加载采集记录失败');
  } finally {
    if (!silent) loading.value = false;
  }
}

async function loadSources() {
  try {
    const data = await api.get<{ items: SourceRow[] }>('/sources?page_size=100');
    sources.value = data.items;
  } catch {
    sources.value = [];
  }
}

async function loadDetails(logId: number, targetPage = 1, silent = false) {
  if (!silent) detailLoading.value = true;
  try {
    const data = await api.get<{ log: LogRow; items: DetailRow[]; total: number }>(
      `/logs/${logId}?page=${targetPage}&page_size=${detailPageSize.value}`,
    );
    currentLog.value = data.log;
    details.value = data.items;
    detailTotal.value = data.total;
    detailPage.value = targetPage;
  } catch (error) {
    if (!silent) ElMessage.error(error instanceof Error ? error.message : '加载明细失败');
  } finally {
    if (!silent) detailLoading.value = false;
  }
}

function search() {
  page.value = 1;
  void load();
}

function reset() {
  filters.status = '';
  filters.source_id = '';
  search();
}

function liveDuration(row: LogRow): string {
  return elapsedText(row.startedAt, row.finishedAt);
}

const progressPercent = computed(() => {
  const log = currentLog.value;
  if (!log) return 0;
  if (log.totalPages <= 0) return log.status === 0 ? 0 : 100;
  return Math.min(100, Math.round((detailTotal.value / log.totalPages) * 100));
});

/** 把毫秒格式化成「X 时 Y 分 Z 秒」，与耗时列同款 */
function msText(ms: number): string {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(totalSec / 3600)} 时 ${Math.floor((totalSec % 3600) / 60)} 分 ${totalSec % 60} 秒`;
}

/** 扣掉中断时长的实际采集耗时 */
const actualDuration = computed(() => {
  const log = currentLog.value;
  if (!log) return '';
  if (log.status === 0 || !log.finishedAt) return liveDuration(log);
  const wall = new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime();
  return msText(wall - (log.interruptedMs || 0));
});

/** 只有执行中且总页数未知时才走不确定态，已结束的一律显示实际百分比 */
const progressIndeterminate = computed(() => {
  const log = currentLog.value;
  return Boolean(log && log.status === 0 && log.totalPages <= 0);
});

function rowIndex(index: number): number {
  return (page.value - 1) * pageSize.value + index + 1;
}

function onPageChange(value: number) {
  page.value = value;
  void load();
}

/** 失败或取消的记录还有剩下的页，就可以从断点继续 */
function canResume(row: LogRow): boolean {
  if (row.status !== 2 && row.status !== 3) return false;
  if (row.totalPages > 0 && row.lastPage >= row.totalPages) return false;
  return true;
}

const resuming = ref(0);

async function resume(row: LogRow): Promise<void> {
  const startPage = row.lastPage + 1;
  const rest = row.totalPages > 0 ? `，剩余 ${row.totalPages - row.lastPage} 页` : '';
  try {
    await ElMessageBox.confirm(
      `将从第 ${startPage} 页继续采集${rest}。续采用任务当前的配置，重新生成一条采集记录；` +
        '源站列表在这期间可能有新增，边界上的少量影片会留给下一轮采集。',
      '断点续采',
      { type: 'warning', confirmButtonText: '开始续采', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  resuming.value = row.id;
  try {
    const result = await api.post<{ logId: number; message: string }>(`/logs/${row.id}/resume`);
    ElMessage.success(result.message);
    await load(true);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    resuming.value = 0;
  }
}

async function openDetail(row: LogRow) {
  drawerVisible.value = true;
  currentLog.value = row;
  details.value = [];
  observeDetail();
  await loadDetails(row.id, 1);
}

function onDetailPageChange(value: number) {
  if (currentLog.value) void loadDetails(currentLog.value.id, value);
}

function onDetailSizeChange(size: number) {
  detailPageSize.value = size;
  if (currentLog.value) void loadDetails(currentLog.value.id, 1);
}

let tickTimer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  await Promise.all([load(), loadSources()]);
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
  timer = setInterval(() => {
    const running = items.value.some((row) => row.status === 0);
    if (running) void load(true);
    if (drawerVisible.value && currentLog.value && currentLog.value.status === 0) {
      void loadDetails(currentLog.value.id, detailPage.value, true);
    }
  }, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (tickTimer) clearInterval(tickTimer);
});

function observeDetail() {
  void nextTick(() => {
    if (!resizeObserver || !detailWrapRef.value) return;
    resizeObserver.observe(detailWrapRef.value);
    detailTableHeight.value = detailWrapRef.value.clientHeight;
  });
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (wrapRef.value) tableHeight.value = wrapRef.value.clientHeight;
    if (detailWrapRef.value) detailTableHeight.value = detailWrapRef.value.clientHeight;
  });
  if (wrapRef.value) {
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
        <el-select v-model="filters.source_id" placeholder="全部采集源" clearable style="width: 180px">
          <el-option v-for="item in sources" :key="item.id" :label="item.name" :value="String(item.id)" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 120px">
          <el-option label="进行中" value="0" />
          <el-option label="成功" value="1" />
          <el-option label="失败" value="2" />
          <el-option label="已取消" value="3" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="hint">只保留最近 30 天的记录，每天凌晨自动清理</span>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div ref="wrapRef" class="table-wrap">
        <el-table
          v-loading="loading"
          :data="items"
          border
          stripe
          :height="tableHeight"
          empty-text="还没有采集记录"
        >
          <el-table-column type="index" label="#" width="80" align="center" :index="rowIndex" />
          <el-table-column prop="taskName" label="任务" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.taskName">{{ row.taskName }}</span>
              <span v-else class="muted">已删除的任务</span>
            </template>
          </el-table-column>
          <el-table-column prop="sourceName" label="采集源" width="130" show-overflow-tooltip />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="statusOf(row).type" size="small">{{ statusOf(row).text }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="采集数" width="90" align="center">
            <template #default="{ row }"><span :class="numClass('total')">{{ row.total }}</span></template>
          </el-table-column>
          <el-table-column label="新增" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('inserted')">{{ row.inserted }}</span></template>
          </el-table-column>
          <el-table-column label="更新" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('updated')">{{ row.updated }}</span></template>
          </el-table-column>
          <el-table-column label="跳过" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('skipped')">{{ row.skipped }}</span></template>
          </el-table-column>
          <el-table-column label="忽略" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('ignored')">{{ row.ignored }}</span></template>
          </el-table-column>
          <el-table-column label="失败" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('failed')">{{ row.failed }}</span></template>
          </el-table-column>
          <el-table-column prop="startedAt" label="开始时间" width="165" align="center" />
          <el-table-column label="耗时" width="130" align="center">
            <template #default="{ row }">{{ liveDuration(row) }}</template>
          </el-table-column>
          <el-table-column prop="message" label="信息" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="130" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">明细</el-button>
              <el-button
                v-if="canResume(row)"
                link
                type="warning"
                :loading="resuming === row.id"
                @click="resume(row)"
              >
                续采
              </el-button>
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

    <el-drawer v-model="drawerVisible" title="采集明细（按页）" size="42%">
      <div v-if="currentLog" class="log-head">
        <el-tag :type="statusOf(currentLog).type">{{ statusOf(currentLog).text }}</el-tag>
        <span>{{ currentLog.startedAt }} 开始，耗时 {{ actualDuration }}</span>
        <div class="progress">
          <span class="progress-text">
            进度 {{ detailTotal }}<template v-if="currentLog.totalPages > 0"> / {{ currentLog.totalPages }}</template> 页
          </span>
          <el-progress
            class="progress-bar"
            :percentage="progressPercent"
            :indeterminate="progressIndeterminate"
            :stroke-width="8"
          />
        </div>
      </div>

      <el-descriptions v-if="currentLog" :column="3" border class="log-summary">
        <el-descriptions-item label="任务">{{ currentLog.taskName || '已删除的任务' }}</el-descriptions-item>
        <el-descriptions-item label="采集源">{{ currentLog.sourceName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="采集数">{{ currentLog.total }}</el-descriptions-item>
        <el-descriptions-item label="新增">{{ currentLog.inserted }}</el-descriptions-item>
        <el-descriptions-item label="更新">{{ currentLog.updated }}</el-descriptions-item>
        <el-descriptions-item label="跳过">{{ currentLog.skipped }}</el-descriptions-item>
        <el-descriptions-item label="忽略">{{ currentLog.ignored }}</el-descriptions-item>
        <el-descriptions-item label="失败">
          <span :class="currentLog.failed > 0 ? 'danger' : ''">{{ currentLog.failed }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ currentLog.finishedAt || '—' }}</el-descriptions-item>
        <el-descriptions-item label="信息" :span="3">{{ currentLog.message || '—' }}</el-descriptions-item>
      </el-descriptions>

      <div ref="detailWrapRef" class="detail-wrap">
      <el-table
        v-loading="detailLoading"
        :data="details"
        border
        class="detail-table"
        empty-text="没有页级明细"
        :height="detailTableHeight"
      >
        <el-table-column prop="page" label="页" width="60" align="center" />
        <el-table-column label="本页条数" width="90" align="center">
          <template #default="{ row }"><span :class="numClass('total')">{{ row.total }}</span></template>
        </el-table-column>
        <el-table-column label="新增" width="70" align="center">
          <template #default="{ row }"><span :class="numClass('inserted')">{{ row.inserted }}</span></template>
        </el-table-column>
        <el-table-column label="更新" width="70" align="center">
          <template #default="{ row }"><span :class="numClass('updated')">{{ row.updated }}</span></template>
        </el-table-column>
        <el-table-column label="跳过" width="70" align="center">
          <template #default="{ row }"><span :class="numClass('skipped')">{{ row.skipped }}</span></template>
        </el-table-column>
        <el-table-column label="忽略" width="70" align="center">
          <template #default="{ row }"><span :class="numClass('ignored')">{{ row.ignored }}</span></template>
        </el-table-column>
        <el-table-column label="失败" width="70" align="center">
          <template #default="{ row }"><span :class="numClass('failed')">{{ row.failed }}</span></template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="200">
          <template #default="{ row }">
            <div v-if="!row.failDetail || row.failDetail.length === 0" class="muted">—</div>
            <div v-for="(item, index) in row.failDetail ?? []" :key="index" class="fail-item">
              {{ item.name || item.vod_id }}：{{ item.reason }}
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>

      <el-pagination
        class="pager"
        layout="total, sizes, prev, pager, next"
        :total="detailTotal"
        :page-sizes="[20, 50, 100]"
        :page-size="detailPageSize"
        :current-page="detailPage"
        @current-change="onDetailPageChange"
        @size-change="onDetailSizeChange"
      />
    </el-drawer>
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
.hint {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.danger {
  color: var(--el-color-danger);
}
.num {
  font-variant-numeric: tabular-nums;
}
.num-total {
  color: var(--el-text-color-primary);
}
.num-inserted {
  color: var(--el-color-success);
}
.num-updated {
  color: var(--el-color-primary);
}
.num-skipped {
  color: var(--el-text-color-secondary);
}
.num-ignored {
  color: var(--el-color-warning);
}
.num-failed {
  color: var(--el-color-danger);
}
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.progress-note {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}
.progress-text {
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
.progress-bar {
  width: 180px;
}
.log-head {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 13px;
}
.log-summary {
  margin-bottom: 16px;
}
.detail-wrap {
  flex: 1;
  min-height: 0;
}
:deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: 12px;
}
:deep(.el-drawer__body) > .pager {
  margin-top: 12px;
  flex: none;
}
.fail-item {
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 1.5;
}
</style>
