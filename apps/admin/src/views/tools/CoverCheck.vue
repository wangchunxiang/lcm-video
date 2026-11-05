<template>
  <div class="page">
    <el-card shadow="never">
      <div class="summary">
        <div class="stat">
          <span class="num">{{ summary.hosts }}</span>
          <span class="label">图片域名</span>
        </div>
        <div class="stat">
          <span class="num ok">{{ summary.ok }}</span>
          <span class="label">正常</span>
        </div>
        <div class="stat">
          <span class="num bad">{{ summary.bad }}</span>
          <span class="label">失效</span>
        </div>
        <div class="stat">
          <span class="num warn">{{ summary.unverified }}</span>
          <span class="label">无法验证</span>
        </div>
        <div class="stat">
          <span class="num">{{ summary.unchecked }}</span>
          <span class="label">未检查</span>
        </div>
        <div class="summary-actions">
          <el-button type="primary" :loading="scanning" @click="scanAll">检查全部</el-button>
          <el-button :loading="loading" @click="load">刷新</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <span>图片域名</span>
          <el-radio-group v-model="statusFilter" size="default">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="0">未检查</el-radio-button>
            <el-radio-button value="1">正常</el-radio-button>
            <el-radio-button value="2">失效</el-radio-button>
            <el-radio-button value="3">无法验证</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <div ref="wrapRef" class="table-wrap">
        <el-table v-loading="loading" :data="rows" border stripe :height="tableHeight">
          <el-table-column prop="host" label="域名" min-width="240" show-overflow-tooltip />
          <el-table-column prop="vodCount" label="影片数" width="100" align="center" />
          <el-table-column label="抽样" width="100" align="center">
            <template #default="{ row }">
              <span v-if="row.status === 0" class="muted">—</span>
              <span v-else>{{ row.sampleOk }} / {{ row.sampleOk + row.sampleFail }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.status === 1" type="success" effect="plain">正常</el-tag>
              <el-tag v-else-if="row.status === 2" type="danger" effect="plain">失效</el-tag>
              <el-tag v-else-if="row.status === 3" type="warning" effect="plain">无法验证</el-tag>
              <el-tag v-else type="info" effect="plain">未检查</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="结论" min-width="200" show-overflow-tooltip />
          <el-table-column label="检查时间" width="170" align="center">
            <template #default="{ row }">{{ row.checkedAt || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="250" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :loading="checking === row.host" @click="checkOne(row)">检查</el-button>
              <el-button link type="primary" @click="openVods(row)">影片</el-button>
              <el-button
                link
                :type="row.status === 2 ? 'danger' : 'primary'"
                :disabled="row.status !== 2 || row.vodCount === 0"
                :loading="repairing === row.host"
                @click="repair(row)"
              >
                修复
              </el-button>
              <el-button
                link
                type="info"
                :disabled="row.vodCount === 0 || webfix === row.host"
                :loading="webfix === row.host"
                @click="clearCovers(row)"
              >
                清空
              </el-button>
            </template>
          </el-table-column>
          <template #empty>没有图片域名</template>
        </el-table>
      </div>
    </el-card>

    <el-drawer v-model="drawerVisible" :title="`${currentHost} 的影片`" size="60%">
      <div ref="drawerWrapRef" class="drawer-body">
        <el-table v-loading="vodLoading" :data="vods" border stripe :height="drawerTableHeight">
          <el-table-column prop="id" label="ID" width="90" align="center" />
          <el-table-column prop="name" label="片名" min-width="240" show-overflow-tooltip />
          <el-table-column prop="cover" label="封面地址" min-width="320" show-overflow-tooltip />
          <template #empty>没有影片</template>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="vodPage"
            :page-size="vodPageSize"
            :total="vodTotal"
            layout="total, prev, pager, next"
            background
            @current-change="loadVods"
          />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { api } from '../../api/client';

interface HostRow {
  host: string;
  vodCount: number;
  status: number;
  sampleOk: number;
  sampleFail: number;
  message: string;
  checkedAt: string | null;
}

interface CoverVod {
  id: number;
  name: string;
  cover: string;
  status: number;
}

const rows = ref<HostRow[]>([]);
const loading = ref(false);
const scanning = ref(false);
const checking = ref('');
const repairing = ref('');
const webfix = ref('');
const statusFilter = ref<'all' | '0' | '1' | '2' | '3'>('all');
const summary = ref({ hosts: 0, ok: 0, bad: 0, unverified: 0, unchecked: 0 });

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let observer: ResizeObserver | null = null;

const drawerVisible = ref(false);
const currentHost = ref('');
const vods = ref<CoverVod[]>([]);
const vodLoading = ref(false);
const vodPage = ref(1);
const vodPageSize = 20;
const vodTotal = ref(0);
const drawerWrapRef = ref<HTMLElement | null>(null);
const drawerTableHeight = ref(400);
let drawerObserver: ResizeObserver | null = null;

const visibleRows = computed(() =>
  statusFilter.value === 'all' ? rows.value : rows.value.filter((row) => String(row.status) === statusFilter.value),
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await api.get<{ items: HostRow[]; summary: typeof summary.value }>('/cover-check');
    rows.value = data.items;
    summary.value = data.summary;
    measure();
  } finally {
    loading.value = false;
  }
}

async function scanAll(): Promise<void> {
  scanning.value = true;
  try {
    await api.post('/cover-check/scan', {});
    await load();
    ElNotification.success({ title: '检查完成', message: `共 ${summary.value.hosts} 个域名` });
  } finally {
    scanning.value = false;
  }
}

async function checkOne(row: HostRow): Promise<void> {
  checking.value = row.host;
  try {
    await api.post('/cover-check/scan', { host: row.host });
    await load();
  } finally {
    checking.value = '';
  }
}

async function openVods(row: HostRow): Promise<void> {
  currentHost.value = row.host;
  vodPage.value = 1;
  drawerVisible.value = true;
  await loadVods();
  await nextTick();
  observeDrawer();
}

async function loadVods(): Promise<void> {
  vodLoading.value = true;
  try {
    const data = await api.get<{ items: CoverVod[]; total: number; page: number; page_size: number }>(
      `/cover-check/${encodeURIComponent(currentHost.value)}/vods`,
      { page: vodPage.value, page_size: vodPageSize },
    );
    vods.value = data.items;
    vodTotal.value = data.total;
  } finally {
    vodLoading.value = false;
  }
}

async function repair(row: HostRow): Promise<void> {
  if (row.vodCount === 0) {
    ElMessage.info('这个域名下已经没有影片了');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `「${row.host}」下有 ${row.vodCount} 部影片的封面失效，将逐个去其他线路或源站重新找封面，可访问的才写回。继续吗？`,
      '修复封面',
      { type: 'warning', confirmButtonText: '开始修复', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  repairing.value = row.host;
  let fixed = 0;
  let failed = 0;
  let idle = 0;
  try {
    for (let round = 0; round < 500; round++) {
      const result = await api.post<{ fixed: number; failed: number; remaining: number; items: Array<{ ok: boolean }> }>(
        '/cover-check/repair',
        { host: row.host, confirm: true, limit: 20 },
      );
      fixed += result.fixed;
      failed += result.failed;
      if (result.remaining === 0) break;
      // 这一轮一个都没修好（修不了的会留在原地被反复选中），连续两轮没进展就收工
      if (result.fixed === 0) idle += 1;
      else idle = 0;
      if (idle >= 2) break;
    }
    ElNotification({
      title: fixed > 0 ? '修复完成' : '没有可用的替代封面',
      type: fixed > 0 ? 'success' : 'warning',
      message: fixed > 0 ? `已替换 ${fixed} 部，${failed} 部没找到可用封面` : `这 ${failed} 部在其他线路和源站都没有可用封面，可以试试「清空」`,
      duration: 8000,
    });
    // 换过封面的影片会落到别的域名下，行数据得重算；放到后台做，别挡提示
    void load();
  } finally {
    repairing.value = '';
  }
}

async function clearCovers(row: HostRow): Promise<void> {
  if (row.vodCount === 0) {
    ElMessage.info('这个域名下已经没有影片了');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `「${row.host}」下的 ${row.vodCount} 部影片会清空封面地址，前台统一显示占位图。继续吗？`,
      '清空封面',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  webfix.value = row.host;
  try {
    await api.post('/cover-check/clear', { host: row.host, confirm: true });
    ElNotification.success({ title: '已清空', message: `共 ${row.vodCount} 部影片改用占位图` });
    void load();
  } finally {
    webfix.value = '';
  }
}

function measure(): void {
  if (wrapRef.value) tableHeight.value = Math.max(160, wrapRef.value.clientHeight);
}

function observe(): void {
  if (!wrapRef.value) return;
  observer = new ResizeObserver(() => measure());
  observer.observe(wrapRef.value);
  measure();
}

function observeDrawer(): void {
  drawerObserver?.disconnect();
  if (!drawerWrapRef.value) return;
  drawerObserver = new ResizeObserver(() => {
    if (drawerWrapRef.value) drawerTableHeight.value = Math.max(160, drawerWrapRef.value.clientHeight - 44);
  });
  drawerObserver.observe(drawerWrapRef.value);
  drawerTableHeight.value = Math.max(160, drawerWrapRef.value.clientHeight - 44);
}

watch(statusFilter, () => nextTick(() => measure()));

onMounted(() => {
  void load();
  observe();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  drawerObserver?.disconnect();
});
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.summary {
  display: flex;
  align-items: center;
  gap: 32px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat .num {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.stat .num.ok {
  color: var(--el-color-success);
}

.stat .num.bad {
  color: var(--el-color-danger);
}

.stat .num.warn {
  color: var(--el-color-warning);
}

.stat .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
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
  padding: 12px 16px 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.table-wrap {
  height: 100%;
}

.muted {
  color: var(--el-text-color-placeholder);
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
