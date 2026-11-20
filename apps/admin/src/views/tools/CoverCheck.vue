<template>
  <div class="page">
    <el-card shadow="never" class="search-card">
      <div class="search-bar">
        <el-input
          v-model="filters.host"
          placeholder="域名"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-select v-model="filters.status" placeholder="全部状态" style="width: 120px">
          <el-option label="全部状态" value="" />
          <el-option label="未检查" value="0" />
          <el-option label="正常" value="1" />
          <el-option label="失效" value="2" />
          <el-option label="无法验证" value="3" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="search">查询</el-button>
        <el-button :disabled="loading" @click="reset">重置</el-button>
      </div>

      <div class="search-extra">
        <span class="summary-text">
          共 {{ summary.hosts }} 个域名 · 正常 {{ summary.ok }} · 失效 {{ summary.bad }} · 无法验证
          {{ summary.unverified }} · 未检查 {{ summary.unchecked }}
        </span>
        <!-- 没有可清理的记录时不显示，避免点了才知道是空的 -->
        <span v-if="staleCount > 0" class="stale-hint">
          另有 {{ staleCount }} 个域名已无影片引用
          <el-button link type="primary" :loading="pruning" @click="pruneHosts">清理</el-button>
        </span>
        <!-- 检查：主按钮就是「待检」（日常唯一会用到的），全部重检藏在右侧下拉里 -->
        <el-button-group class="scan-group">
          <el-button type="primary" :loading="scanning" @click="scanAll('pending')">
            检查待检（{{ pendingCount }}）
          </el-button>
          <el-dropdown trigger="click" :disabled="scanning" @command="onScanCommand">
            <el-button type="primary" :icon="ArrowDown" :disabled="scanning" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pending">
                  检查待检域名（{{ pendingCount }} 个）
                </el-dropdown-item>
                <el-dropdown-item command="all">全部重检（{{ summary.hosts }} 个）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-button-group>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-button
          type="danger"
          plain
          :disabled="selectedHosts.length === 0"
          :loading="batchRunning"
          @click="repairSelected"
        >
          批量修复{{ selectedHosts.length ? `（${selectedHosts.length}）` : '' }}
        </el-button>
        <span class="toolbar-tip">
          {{ selectedHosts.length ? `已选 ${selectedHosts.length} 个域名` : '勾选域名后可批量修复' }}
        </span>
        <span class="toolbar-count">已显示 {{ visibleRows.length }} / {{ filtered.length }} 个域名</span>
      </div>

      <div ref="wrapRef" class="table-wrap">
        <el-table
          v-loading="loading"
          :data="visibleRows"
          border
          stripe
          :height="tableHeight"
          @selection-change="onSelectionChange"
        >
          <el-table-column type="selection" width="44" :selectable="canSelect" />
          <el-table-column prop="host" label="域名" min-width="200" show-overflow-tooltip />
          <el-table-column prop="vodCount" label="影片数" width="90" align="center" />
          <el-table-column label="抽样" width="90" align="center">
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
          <el-table-column prop="message" label="结论" min-width="160" show-overflow-tooltip />
          <el-table-column label="检查时间" width="170" align="center">
            <template #default="{ row }">{{ formatDateTime(row.checkedAt) || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="240" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :loading="checking === row.host" @click="checkOne(row)">检查</el-button>
              <el-button link type="primary" @click="openVods(row)">影片</el-button>
              <el-button
                link
                type="primary"
                :disabled="(row.status !== 2 && row.status !== 3) || row.vodCount === 0"
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
import { ElLoading, ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { formatDateTime } from '../../utils/datetime';

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
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  name: string;
  cover: string;
}

const rows = ref<HostRow[]>([]);
const loading = ref(false);
const scanning = ref(false);
const pruning = ref(false);
const checking = ref('');
const repairing = ref('');
const webfix = ref('');
const batchRunning = ref(false);
const selectedHosts = ref<string[]>([]);
const filters = ref({ host: '', status: '' });
const applied = ref({ host: '', status: '' });
const PAGE = 20;
const visibleCount = ref(PAGE);
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

/** 待检 = 上次不是「正常」的域名（未检查 / 失效 / 无法验证） */
const pendingCount = computed(() => rows.value.filter((row) => row.status !== 1).length);
/** 已经没有影片引用的域名，只能清理，重检只会得出「库里没有该域名的图片」 */
const staleCount = computed(() => rows.value.filter((row) => row.vodCount === 0).length);

const filtered = computed(() =>
  rows.value.filter((row) => {
    if (applied.value.host && !row.host.toLowerCase().includes(applied.value.host.trim().toLowerCase())) {
      return false;
    }
    return applied.value.status === '' || String(row.status) === applied.value.status;
  }),
);

const visibleRows = computed(() => filtered.value.slice(0, visibleCount.value));

/**
 * 查询：先重新取一次域名列表，再应用筛选条件。
 * 原来「刷新」是唯一重新拉数据的入口，和「查询」并存会让人以为查询也刷新了数据，
 * 实际只做前端过滤；这里合并成一个入口。
 */
async function search(): Promise<void> {
  await load();
  applied.value = { ...filters.value };
  visibleCount.value = PAGE;
}

function reset(): void {
  filters.value = { host: '', status: '' };
  void search();
}

/** el-table 自带固定高度，滚动条在内部的 .el-scrollbar__wrap 上 */
let scroller: HTMLElement | null = null;

function onScroll(): void {
  if (!scroller) return;
  if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 40) return;
  if (visibleCount.value >= filtered.value.length) return;
  visibleCount.value += PAGE;
}

function bindScroll(): void {
  const el = wrapRef.value?.querySelector<HTMLElement>('.el-scrollbar__wrap') ?? null;
  if (!el || el === scroller) return;
  scroller?.removeEventListener('scroll', onScroll);
  scroller = el;
  scroller.addEventListener('scroll', onScroll, { passive: true });
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await api.longPost<{ hosts: HostRow[]; summary: typeof summary.value }>('/cover-check/hosts');
    rows.value = data.hosts;
    summary.value = data.summary;
    measure();
  } finally {
    loading.value = false;
  }
}

/**
 * 同时扫描的域名数。只影响不同域名之间：单个域名内抽 2 张图是紧接着发的，没有间隔等待
 * （见 probe.ts 的 probeImage）。每个域名通常 0.3~0.5 秒，按 0.5 秒估算整体耗时。
 */
const SCAN_PARALLEL = 8;
/** 单个域名扫描的粗估耗时（毫秒），只用于确认框里的预计时间 */
const SCAN_PER_HOST_MS = 500;

function onScanCommand(command: string): void {
  void scanAll(command === 'all' ? 'all' : 'pending');
}

async function scanAll(mode: 'pending' | 'all'): Promise<void> {
  // 先现拉一次域名列表：域名来自 lcm_vod 的实时分组，页面打开后新入库的影片会带来新域名，
  // 不重新拉就会漏掉它们（确认框里的数量也会是旧的）。
  await load();
  if (mode === 'all') {
    const ok = await ElMessageBox.confirm(
      `全部重检会忽略历史结果，把 ${summary.value.hosts} 个域名重新跑一遍（每个域名抽 2 张图），预计 ${
        Math.max(1, Math.round((summary.value.hosts / SCAN_PARALLEL) * (SCAN_PER_HOST_MS / 1000)))
      } 秒。`,
      '全部重检',
      { type: 'warning', confirmButtonText: '开始重检', cancelButtonText: '取消' },
    ).then(() => true, () => false);
    if (!ok) return;
  }
  const targets = mode === 'all' ? rows.value : rows.value.filter((row) => row.status !== 1);
  const skipped = rows.value.length - targets.length;
  if (targets.length === 0) {
    ElNotification.info({ title: '没有需要检查的域名', message: '所有域名上次检查都正常' });
    return;
  }
  scanning.value = true;
  try {
    // v3 只有单域名扫描接口，这里按 SCAN_PARALLEL 个并发把目标域名跑一遍
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < targets.length) {
        const row = targets[cursor];
        cursor += 1;
        if (!row) continue;
        await api.longPost('/cover-check/scan', { host: row.host });
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_PARALLEL, targets.length) }, () => worker()));
    await load();
    const tail = mode === 'pending' && skipped > 0 ? `，跳过 ${skipped} 个上次正常的域名` : '';
    ElNotification.success({ title: '检查完成', message: `共检查 ${targets.length} 个域名${tail}` });
  } finally {
    scanning.value = false;
  }
}

/** 清掉已经没有影片引用的域名记录（只删体检记录，不动影片数据） */
async function pruneHosts(): Promise<void> {
  const stale = rows.value.filter((row) => row.vodCount === 0).length;
  if (stale === 0) {
    ElNotification.info({ title: '没有可清理的记录', message: '每个域名下都还有影片引用' });
    return;
  }
  const ok = await ElMessageBox.confirm(
    `会删掉 ${stale} 条已经没有影片引用的域名记录，只删体检记录，不动影片数据。继续吗？`,
    '清理无引用',
    { type: 'warning', confirmButtonText: '清理', cancelButtonText: '取消' },
  ).then(
    () => true,
    () => false,
  );
  if (!ok) return;
  pruning.value = true;
  try {
    const result = await api.longPost<{ deleted: number }>('/cover-check/prune', {});
    await load();
    ElNotification.success({ title: '已清理', message: `删掉 ${result.deleted} 条记录` });
  } finally {
    pruning.value = false;
  }
}

async function checkOne(row: HostRow): Promise<void> {
  checking.value = row.host;
  try {
    await api.longPost('/cover-check/scan', { host: row.host });
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
    const data = await api.post<{ items: CoverVod[]; total: number }>('/cover-check/host-vods', {
      host: currentHost.value,
      take: vodPageSize,
      skip: (vodPage.value - 1) * vodPageSize,
    });
    vods.value = data.items;
    vodTotal.value = data.total;
  } finally {
    vodLoading.value = false;
  }
}

/** 单个域名一轮轮修到没有进展为止，单个与批量共用 */
async function runRepair(
  host: string,
  onRound?: (fixed: number, failed: number) => void,
): Promise<{ fixed: number; failed: number }> {
  let fixed = 0;
  let failed = 0;
  let idle = 0;
  for (let round = 0; round < 500; round++) {
    const result = await api.post<{ fixed: number; failed: number; remaining: number; items: Array<{ ok: boolean }> }>(
      '/cover-check/repair',
      { host, limit: 20 },
    );
    fixed += result.fixed;
    failed += result.failed;
    onRound?.(fixed, failed);
    if (result.remaining === 0) break;
    // 这一轮一个都没修好（修不了的会留在原地被反复选中），连续两轮没进展就收工
    if (result.fixed === 0) idle += 1;
    else idle = 0;
    if (idle >= 2) break;
  }
  return { fixed, failed };
}

function canSelect(row: HostRow): boolean {
  return (row.status === 2 || row.status === 3) && row.vodCount > 0;
}

function onSelectionChange(picked: HostRow[]): void {
  selectedHosts.value = picked.map((row) => row.host);
}

async function repairSelected(): Promise<void> {
  const targets = rows.value.filter((row) => selectedHosts.value.includes(row.host) && row.vodCount > 0);
  if (targets.length === 0) {
    ElMessage.info('请先勾选要修复的失效域名');
    return;
  }
  const totalVods = targets.reduce((sum, row) => sum + row.vodCount, 0);
  const unverified = targets.filter((row) => row.status === 3);
  const unverifiedNote =
    unverified.length > 0
      ? `
其中 ${unverified.length} 个域名（${unverified.map((row) => row.host).join('、')}）只是服务器这边测不到，可能实际正常，修了会换成别的封面。`
      : '';
  try {
    await ElMessageBox.confirm(
      `已勾选 ${targets.length} 个域名、共 ${totalVods} 部影片的封面失效，将逐个去其他线路或源站重新找封面，可访问的才写回。${unverifiedNote}继续吗？`,
      '批量修复封面',
      { type: 'warning', confirmButtonText: '开始修复', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  batchRunning.value = true;
  const loading = ElLoading.service({ lock: true, text: `正在修复 1/${targets.length}…`, background: 'rgba(0, 0, 0, 0.6)' });
  let fixed = 0;
  let failed = 0;
  try {
    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      if (!row) continue;
      loading.setText(`正在修复 ${i + 1}/${targets.length}：${row.host}（已替换 ${fixed} 部）`);
      const result = await runRepair(row.host, (hostFixed) => {
        loading.setText(`正在修复 ${i + 1}/${targets.length}：${row.host}（本域名已替换 ${hostFixed} 部）`);
      });
      fixed += result.fixed;
      failed += result.failed;
    }
    ElNotification({
      title: fixed > 0 ? '批量修复完成' : '没有可用的替代封面',
      type: fixed > 0 ? 'success' : 'warning',
      message:
        fixed > 0
          ? `${targets.length} 个域名：已替换 ${fixed} 部，${failed} 部没找到可用封面`
          : `这 ${failed} 部在其他线路和源站都没有可用封面，可以试试「清空」`,
      duration: 8000,
    });
  } finally {
    loading.close();
    batchRunning.value = false;
    selectedHosts.value = [];
    void load();
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
  try {
    const { fixed, failed } = await runRepair(row.host);
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
    await api.post('/cover-check/clear', { host: row.host });
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
  nextTick(() => bindScroll());
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

watch(filtered, () => {
  nextTick(() => {
    measure();
    bindScroll();
  });
});

onMounted(() => {
  void load();
  observe();
});

onBeforeUnmount(() => {
  scroller?.removeEventListener('scroll', onScroll);
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

.search-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.search-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.search-extra {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.summary-text {
  margin-right: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

/* 「另有 N 个域名已无影片引用 · 清理」：只在真有这类记录时出现 */
.stale-hint {
  margin-right: 12px;
  font-size: 12px;
  color: var(--el-color-warning);
  font-variant-numeric: tabular-nums;
}
.stale-hint :deep(.el-button) {
  font-size: 12px;
  vertical-align: baseline;
}

/* 检查主按钮 + 下拉，两者共享一组边框，看起来是一个控件 */
.scan-group :deep(.el-button:first-child) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.scan-group :deep(.el-dropdown .el-button) {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  padding-left: 8px;
  padding-right: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  flex: none;
  margin-bottom: 12px;
}

.toolbar-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.toolbar-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
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

.table-wrap {
  flex: 1;
  min-height: 0;
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
  margin-top: 12px;
}
</style>
