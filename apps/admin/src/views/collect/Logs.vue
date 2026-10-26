<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
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

const items = ref<LogRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const filters = ref({ status: '' as string, source_id: 0 });

const drawerVisible = ref(false);
const currentLog = ref<LogRow | null>(null);
const details = ref<DetailRow[]>([]);
const detailTotal = ref(0);
const detailPage = ref(1);
const detailLoading = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value) });
    if (filters.value.status !== '') params.set('status', filters.value.status);
    if (filters.value.source_id > 0) params.set('source_id', String(filters.value.source_id));
    const data = await api.get<{ items: LogRow[]; total: number }>(`/logs?${params.toString()}`);
    items.value = data.items;
    total.value = data.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载采集记录失败');
  } finally {
    loading.value = false;
  }
}

async function loadDetails(logId: number, targetPage = 1) {
  detailLoading.value = true;
  try {
    const data = await api.get<{ log: LogRow; items: DetailRow[]; total: number }>(
      `/logs/${logId}?page=${targetPage}&page_size=20`,
    );
    currentLog.value = data.log;
    details.value = data.items;
    detailTotal.value = data.total;
    detailPage.value = targetPage;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载明细失败');
  } finally {
    detailLoading.value = false;
  }
}

async function openDetail(row: LogRow) {
  drawerVisible.value = true;
  currentLog.value = row;
  await loadDetails(row.id, 1);
}

function statusOf(row: { status: number; runningLogId?: number | null }): { text: string; type: 'success' | 'danger' | 'info' | 'warning' } {
  if (row.status === 0) return { text: '进行中', type: 'warning' };
  if (row.status === 1) return { text: '成功', type: 'success' };
  if (row.status === 2) return { text: '失败', type: 'danger' };
  return { text: '已取消', type: 'info' };
}

function onPageChange(value: number) {
  page.value = value;
  void load();
}

function onDetailPageChange(value: number) {
  if (currentLog.value) void loadDetails(currentLog.value.id, value);
}

onMounted(async () => {
  await load();
  timer = setInterval(() => {
    const running = items.value.some((row) => row.status === 0);
    if (running) void load();
  }, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-select v-model="filters.status" placeholder="状态" style="width: 130px" clearable>
        <el-option label="进行中" value="0" />
        <el-option label="成功" value="1" />
        <el-option label="失败" value="2" />
        <el-option label="已取消" value="3" />
      </el-select>
      <el-button type="primary" @click="((page = 1), load())">查询</el-button>
      <el-button :loading="loading" @click="load">刷新</el-button>
      <span class="hint">保留最近 30 天记录</span>
    </div>

    <el-table v-loading="loading" :data="items" border stripe empty-text="还没有采集记录">
      <el-table-column prop="id" label="#" width="70" />
      <el-table-column label="任务 / 采集源" min-width="180">
        <template #default="{ row }">
          <div>{{ row.taskName || '—' }}</div>
          <div class="muted">{{ row.sourceName || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusOf(row).type" size="small">{{ statusOf(row).text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="总数" width="80" align="center" prop="total" />
      <el-table-column label="新增 / 更新" width="110" align="center">
        <template #default="{ row }">{{ row.inserted }} / {{ row.updated }}</template>
      </el-table-column>
      <el-table-column label="跳过 / 忽略" width="110" align="center">
        <template #default="{ row }">{{ row.skipped }} / {{ row.ignored }}</template>
      </el-table-column>
      <el-table-column label="失败" width="80" align="center">
        <template #default="{ row }">
          <span :class="row.failed > 0 ? 'danger' : ''">{{ row.failed }}</span>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" width="170" prop="startedAt" />
      <el-table-column prop="message" label="信息" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
    />

    <el-drawer v-model="drawerVisible" title="采集明细（按页）" size="70%">
      <div v-if="currentLog" class="log-head">
        <el-tag :type="statusOf(currentLog).type">{{ statusOf(currentLog).text }}</el-tag>
        <span>任务：{{ currentLog.taskName || '—' }}</span>
        <span>采集源：{{ currentLog.sourceName || '—' }}</span>
        <span>总计 {{ currentLog.total }} 条，新增 {{ currentLog.inserted }}，更新 {{ currentLog.updated }}，跳过 {{ currentLog.skipped }}，忽略 {{ currentLog.ignored }}，失败 {{ currentLog.failed }}</span>
      </div>

      <el-table v-loading="detailLoading" :data="details" border size="small">
        <el-table-column prop="page" label="页" width="70" align="center" />
        <el-table-column prop="total" label="本页条数" width="100" align="center" />
        <el-table-column prop="inserted" label="新增" width="80" align="center" />
        <el-table-column prop="updated" label="更新" width="80" align="center" />
        <el-table-column prop="skipped" label="跳过" width="80" align="center" />
        <el-table-column prop="ignored" label="忽略" width="80" align="center" />
        <el-table-column prop="failed" label="失败" width="80" align="center" />
        <el-table-column label="失败原因" min-width="220">
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
        layout="total, prev, pager, next"
        :total="detailTotal"
        :page-size="20"
        :current-page="detailPage"
        @current-change="onDetailPageChange"
      />
    </el-drawer>
  </el-card>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.danger {
  color: var(--el-color-danger);
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.log-head {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 13px;
}
.fail-item {
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 1.5;
}
</style>
