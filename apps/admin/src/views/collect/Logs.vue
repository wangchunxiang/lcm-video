<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { TagProps } from 'element-plus';
import { api } from '../../api/client.ts';

interface LogRow {
  id: number;
  taskId: number;
  taskName: string | null;
  sourceId: number;
  sourceName: string | null;
  status: number;
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
let resizeObserver: ResizeObserver | null = null;

type NumKind = 'total' | 'inserted' | 'updated' | 'skipped' | 'ignored' | 'failed';

function numClass(kind: NumKind, value: number): string {
  return value > 0 ? `num num-${kind}` : 'num num-zero';
}

function statusOf(row: { status: number }): { text: string; type: TagProps['type'] } {
  if (row.status === 0) return { text: '进行中', type: 'warning' };
  if (row.status === 1) return { text: '成功', type: 'success' };
  if (row.status === 2) return { text: '失败', type: 'danger' };
  return { text: '已取消', type: 'info' };
}

function durationText(row: LogRow): string {
  if (!row.finishedAt) return '—';
  const start = new Date(row.startedAt.replace(' ', 'T')).getTime();
  const end = new Date(row.finishedAt.replace(' ', 'T')).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  return `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
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

function onPageChange(value: number) {
  page.value = value;
  void load();
}

async function openDetail(row: LogRow) {
  drawerVisible.value = true;
  currentLog.value = row;
  details.value = [];
  await loadDetails(row.id, 1);
}

function onDetailPageChange(value: number) {
  if (currentLog.value) void loadDetails(currentLog.value.id, value);
}

function onDetailSizeChange(size: number) {
  detailPageSize.value = size;
  if (currentLog.value) void loadDetails(currentLog.value.id, 1);
}

onMounted(async () => {
  await Promise.all([load(), loadSources()]);
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
          <el-table-column prop="id" label="#" width="80" align="center" />
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
            <template #default="{ row }"><span :class="numClass('total', row.total)">{{ row.total }}</span></template>
          </el-table-column>
          <el-table-column label="新增" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('inserted', row.inserted)">{{ row.inserted }}</span></template>
          </el-table-column>
          <el-table-column label="更新" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('updated', row.updated)">{{ row.updated }}</span></template>
          </el-table-column>
          <el-table-column label="跳过" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('skipped', row.skipped)">{{ row.skipped }}</span></template>
          </el-table-column>
          <el-table-column label="忽略" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('ignored', row.ignored)">{{ row.ignored }}</span></template>
          </el-table-column>
          <el-table-column label="失败" width="80" align="center">
            <template #default="{ row }"><span :class="numClass('failed', row.failed)">{{ row.failed }}</span></template>
          </el-table-column>
          <el-table-column prop="startedAt" label="开始时间" width="165" align="center" />
          <el-table-column label="耗时" width="100" align="center">
            <template #default="{ row }">{{ durationText(row) }}</template>
          </el-table-column>
          <el-table-column prop="message" label="信息" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="90" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">明细</el-button>
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

    <el-drawer v-model="drawerVisible" title="采集明细（按页）" size="70%">
      <div v-if="currentLog" class="log-head">
        <el-tag :type="statusOf(currentLog).type">{{ statusOf(currentLog).text }}</el-tag>
        <span>{{ currentLog.startedAt }} 开始，耗时 {{ durationText(currentLog) }}</span>
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

      <el-table v-loading="detailLoading" :data="details" border class="detail-table" empty-text="没有页级明细">
        <el-table-column prop="page" label="页" width="70" align="center" />
        <el-table-column label="本页条数" width="100" align="center">
          <template #default="{ row }"><span :class="numClass('total', row.total)">{{ row.total }}</span></template>
        </el-table-column>
        <el-table-column label="新增" width="80" align="center">
          <template #default="{ row }"><span :class="numClass('inserted', row.inserted)">{{ row.inserted }}</span></template>
        </el-table-column>
        <el-table-column label="更新" width="80" align="center">
          <template #default="{ row }"><span :class="numClass('updated', row.updated)">{{ row.updated }}</span></template>
        </el-table-column>
        <el-table-column label="跳过" width="80" align="center">
          <template #default="{ row }"><span :class="numClass('skipped', row.skipped)">{{ row.skipped }}</span></template>
        </el-table-column>
        <el-table-column label="忽略" width="80" align="center">
          <template #default="{ row }"><span :class="numClass('ignored', row.ignored)">{{ row.ignored }}</span></template>
        </el-table-column>
        <el-table-column label="失败" width="80" align="center">
          <template #default="{ row }"><span :class="numClass('failed', row.failed)">{{ row.failed }}</span></template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="240">
          <template #default="{ row }">
            <div v-if="!row.failDetail || row.failDetail.length === 0" class="muted">—</div>
            <div v-for="(item, index) in row.failDetail ?? []" :key="index" class="fail-item">
              {{ item.name || item.vod_id }}：{{ item.reason }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="信息" min-width="150" show-overflow-tooltip />
      </el-table>

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
.num-zero {
  color: var(--el-text-color-placeholder);
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
.detail-table {
  margin-bottom: 12px;
}
.fail-item {
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 1.5;
}
</style>
