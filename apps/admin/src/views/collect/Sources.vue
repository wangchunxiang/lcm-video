<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { buildListQuery } from '@lcm/api-client';
import { api } from '../../api/client.ts';
import ProTable from '../../components/ProTable.vue';
import { bulkDelete } from '../../utils/bulk.ts';
import { useTableQuery } from '../../composables/useTableQuery.ts';
import { formatDateTime } from '../../utils/datetime.ts';

interface SourceRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  name: string;
  apiUrl: string;
  apiParams: string;
  parseUrl: string;
  playFrom: string;
  isEnabled: number;
  pagesize: number;
  intervalSec: number;
  timeout: number;
  retryTimes: number;
  lastSyncAt: string | null;
  lastSyncStatus: number;
  lastSyncMsg: string;
}

const items = ref<SourceRow[]>([]);
const selection = ref<SourceRow[]>([]);
const tableRef = ref<{ clearSelection: () => void } | null>(null);
const total = ref(0);
/** 筛选条件与分页跟 URL 绑定 */
const {
  filters,
  page,
  pageSize,
  search: syncSearch,
  reset: resetQuery,
  onPageChange: setPage,
} = useTableQuery({ keyword: '', status: '' }, { pageSize: 20 });

const loading = ref(false);
const testing = ref('');
const dialogVisible = ref(false);
const dialogTitle = ref('新增源站');
const editingId = ref('');

const form = reactive({
  name: '',
  api_url: '',
  api_params: '',
  parse_url: '',
  is_enabled: 1,
  pagesize: 100,
  interval_sec: 3,
  timeout: 30,
  retry_times: 2,
});

const FORBIDDEN_PARAMS = ['ac', 'pg', 'pagesize', 'at', 'h'];

const paramsError = computed(() => {
  const raw = form.api_params.trim().replace(/^\?/, '');
  if (!raw) return '';
  const params = new URLSearchParams(raw);
  const hits = FORBIDDEN_PARAMS.filter((key) => params.has(key));
  return hits.length > 0 ? `不能填写 ${hits.join('、')}，这些参数由程序控制` : '';
});

async function load() {
  loading.value = true;
  try {
    const where: Record<string, unknown> = {};
    const keyword = filters.keyword.trim();
    if (keyword) where['name'] = { $like: `%${keyword}%` };
    if (filters.status !== '') where['isEnabled'] = Number(filters.status);
    const data = await api.get<{ items: SourceRow[]; total: number }>(
      '/collect-source',
      buildListQuery({
        take: pageSize.value,
        skip: (page.value - 1) * pageSize.value,
        where,
        order: { id: 'ASC' },
      }),
    );
    items.value = data.items;
    total.value = data.total;
    selection.value = [];
    tableRef.value?.clearSelection();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载采集源失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  syncSearch();
  void load();
}

function reset() {
  resetQuery();
  void load();
}

function onPageChange(next: number) {
  setPage(next);
  void load();
}

function resetForm() {
  form.name = '';
  form.api_url = '';
  form.api_params = '';
  form.parse_url = '';
  form.is_enabled = 1;
  form.pagesize = 100;
  form.interval_sec = 3;
  form.timeout = 30;
  form.retry_times = 2;
  editingId.value = '';
}

function openCreate() {
  resetForm();
  dialogTitle.value = '新增源站';
  dialogVisible.value = true;
}

function openEdit(row: SourceRow) {
  resetForm();
  editingId.value = row.id;
  form.name = row.name;
  form.api_url = row.apiUrl;
  form.api_params = row.apiParams;
  form.parse_url = row.parseUrl;
  form.is_enabled = row.isEnabled;
  form.pagesize = row.pagesize;
  form.interval_sec = row.intervalSec;
  form.timeout = row.timeout;
  form.retry_times = row.retryTimes;
  dialogTitle.value = '编辑源站';
  dialogVisible.value = true;
}

function readNumber(value: unknown, fallback: number, min: number, max: number, label: string): number | null {
  const raw = typeof value === 'string' ? value.trim() : value;
  const n = Number(raw === '' || raw === undefined || raw === null ? fallback : raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    ElMessage.warning(`${label}必须是不小于 ${min}、不大于 ${max} 的整数`);
    return null;
  }
  return n;
}

async function submit() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称');
  if (!/^https?:\/\//i.test(form.api_url.trim())) return ElMessage.warning('接口地址必须以 http:// 或 https:// 开头');
  if (paramsError.value) return ElMessage.warning(paramsError.value);

  const pagesize = readNumber(form.pagesize, 100, 1, 100, '每页条数');
  if (pagesize === null) return;
  const intervalSec = readNumber(form.interval_sec, 3, 1, 600, '请求间隔');
  if (intervalSec === null) return;
  const timeout = readNumber(form.timeout, 30, 1, 300, '超时时间');
  if (timeout === null) return;
  const retryTimes = readNumber(form.retry_times, 2, 0, 10, '重试次数');
  if (retryTimes === null) return;

  const payload = {
    name: form.name.trim(),
    apiUrl: form.api_url.trim(),
    apiParams: form.api_params.trim(),
    parseUrl: form.parse_url.trim(),
    isEnabled: form.is_enabled,
    pagesize,
    intervalSec,
    timeout,
    retryTimes,
  };

  try {
    if (editingId.value !== '') {
      await api.put(`/collect-source/${editingId.value}`, payload);
    } else {
      await api.post('/collect-source', payload);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

function onSelectionChange(rows: SourceRow[]) {
  selection.value = rows;
}

/** 批量启用/停用：v3 没有批量动作接口，逐个 PUT。 */
async function batchStatus(action: 'enable' | 'disable') {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  const isEnabled = action === 'enable' ? 1 : 0;
  try {
    for (const id of ids) {
      await api.put(`/collect-source/${id}`, { isEnabled });
    }
    ElMessage.success(action === 'enable' ? `已启用 ${ids.length} 个源` : `已停用 ${ids.length} 个源`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function batchDelete() {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  const { ok, failed } = await bulkDelete('/collect-source', ids);
  if (failed.length === 0) {
    ElMessage.success(`已删除 ${ok} 个采集源`);
  } else {
    ElMessage.error(`删除 ${ok} 个，失败 ${failed.length} 个`);
  }
  await load();
}

/**
 * 删源不可恢复，先提示影响范围，再单独确认一次。
 * 返回 true 表示两次确认都点了确认。
 */
async function confirmRemove(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    });
  } catch {
    return false;
  }
  try {
    await ElMessageBox.confirm('此操作不可恢复，确定继续删除吗？', '再次确认', {
      type: 'error',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
  } catch {
    return false;
  }
  return true;
}

async function confirmBatchDelete() {
  const confirmed = await confirmRemove(
    `确定删除选中的 ${selection.value.length} 个采集源吗？该源的分类映射与采集任务会一并删除。`,
    '批量删除',
  );
  if (!confirmed) return;
  await batchDelete();
}

async function testSource(row: SourceRow) {
  testing.value = row.id;
  const notice = ElNotification({
    title: '正在测试',
    message: `正在测试 ${row.name}…`,
    type: 'info',
    position: 'top-right',
    duration: 0,
    showClose: false,
  });
  try {
    const data = await api.post<{ ok: boolean; elapsedMs: number; categories: number; via: string; msg: string }>(
      '/collect-source/test',
      { id: row.id },
    );
    notice.close();
    if (data.ok) {
      ElNotification({
        title: '测试通过',
        message: `${row.name}：接口正常，耗时 ${data.elapsedMs}ms，${data.categories} 个分类（${data.via}）`,
        type: 'success',
        position: 'top-right',
        duration: 4000,
      });
    } else {
      ElNotification({
        title: '测试失败',
        message: `${row.name}：${data.msg || '接口返回异常'}`,
        type: 'error',
        position: 'top-right',
        duration: 0,
        showClose: true,
      });
    }
  } catch (error) {
    notice.close();
    ElNotification({
      title: '测试失败',
      message: `${row.name}：${error instanceof Error ? error.message : '测试失败'}`,
      type: 'error',
      position: 'top-right',
      duration: 0,
      showClose: true,
    });
  } finally {
    testing.value = '';
  }
}

function toBody(row: SourceRow, patch: Partial<Record<string, unknown>> = {}) {
  return {
    name: row.name,
    apiUrl: row.apiUrl,
    apiParams: row.apiParams,
    parseUrl: row.parseUrl,
    isEnabled: row.isEnabled,
    intervalSec: row.intervalSec,
    pagesize: row.pagesize,
    timeout: row.timeout,
    retryTimes: row.retryTimes,
    ...patch,
  };
}

/** 手动采集的时间窗：1 最近24小时 / 2 最近7天 / 3 最近30天 / 4 全部（与采集引擎的 RANGE_LABELS 一致） */
const RUN_RANGES = [
  { value: 1, label: '最近 24 小时' },
  { value: 2, label: '最近 7 天' },
  { value: 3, label: '最近 30 天' },
  { value: 4, label: '全部' },
] as const;

async function runSource(row: SourceRow, rangeType: number) {
  const rangeLabel = RUN_RANGES.find((item) => item.value === rangeType)?.label ?? '全部';
  try {
    await ElMessageBox.confirm(
      `将按「${rangeLabel}」采集「${row.name}」，源站数据量大时可能要跑很久，确定开始吗？`,
      '开始采集',
      { type: 'warning', confirmButtonText: '开始采集', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    const result = await api.post<{ ok: boolean; logId?: string; msg?: string }>('/collect-source/run', {
      id: row.id,
      rangeType,
    });
    if (result.ok) {
      ElMessage.success(`已开始采集「${row.name}」，可在采集记录查看进度`);
    } else {
      ElMessage.warning(result.msg || '未能开始采集');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '开始采集失败');
  }
}

async function toggleStatus(row: SourceRow) {
  const next = row.isEnabled === 1 ? 0 : 1;
  try {
    await api.put(`/collect-source/${row.id}`, toBody(row, { isEnabled: next }));
    ElMessage.success(next === 1 ? '已启用' : '已停用');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

async function remove(row: SourceRow) {
  const confirmed = await confirmRemove(
    `确定删除采集源「${row.name}」吗？该源的分类映射与采集任务会一并删除。`,
    '删除采集源',
  );
  if (!confirmed) return;

  try {
    await api.del(`/collect-source/${row.id}`);
    ElMessage.success('已删除采集源');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
  <el-card shadow="never" class="search-card">
    <div class="search-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="采集源名称"
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
      <el-button type="primary" @click="openCreate">新增源站</el-button>
      <el-button type="success" :disabled="selection.length === 0" @click="batchStatus('enable')">批量启用</el-button>
      <el-button type="warning" :disabled="selection.length === 0" @click="batchStatus('disable')">批量停用</el-button>
      <el-button type="danger" :disabled="selection.length === 0" @click="confirmBatchDelete">批量删除</el-button>
    </div>

    <ProTable
      ref="tableRef"
      :data="items"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :loading="loading"
      border
      stripe
      @update:page="setPage"
      @update:page-size="(size: number) => ((pageSize = size), search())"
      @selection-change="(rows) => onSelectionChange(rows as SourceRow[])"
    >
      <el-table-column type="selection" width="44" fixed="left" />
      <el-table-column prop="name" label="名称" width="110" show-overflow-tooltip />
      <el-table-column prop="apiUrl" label="接口地址" min-width="240" show-overflow-tooltip />
      <el-table-column label="解析接口" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.parseUrl">{{ row.parseUrl }}</span>
          <span v-else class="muted">未配置（直连播放）</span>
        </template>
      </el-table-column>
      <el-table-column label="每页条数" width="100" align="center">
        <template #default="{ row }">{{ row.pagesize }}</template>
      </el-table-column>
      <el-table-column label="间隔" width="70" align="center">
        <template #default="{ row }">{{ row.intervalSec }} 秒</template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.isEnabled === 1" @change="toggleStatus(row)" />
        </template>
      </el-table-column>
      <el-table-column label="最后同步" width="165" align="center">
        <template #default="{ row }">
          <span v-if="row.lastSyncStatus !== 0" :class="row.lastSyncStatus === 2 ? 'danger' : ''">
            {{ formatDateTime(row.lastSyncAt) || '—' }}
          </span>
          <span v-else class="muted">未同步</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="196" align="center" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button link type="primary" :disabled="testing === row.id" @click="testSource(row)">测试</el-button>
            <el-dropdown trigger="click" @command="(range: number) => runSource(row, range)">
              <el-button link type="primary">采集</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="range in RUN_RANGES" :key="range.value" :command="range.value">
                    采集{{ range.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </ProTable>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：西瓜资源" />
        </el-form-item>
        <el-form-item label="接口地址" required>
          <el-input v-model="form.api_url" placeholder="https://example.com/api.php/provide/vod/" />
        </el-form-item>
        <el-form-item label="额外参数">
          <el-input v-model="form.api_params" placeholder="如 t=1&amp;year=2024，可留空" />
          <div class="hint" :class="{ danger: paramsError }">
            {{ paramsError || '可填写接口的其它查询参数，ac、pg、pagesize、at、h 由程序控制，不要填写' }}
          </div>
        </el-form-item>
        <el-form-item label="解析接口">
          <el-input v-model="form.parse_url" placeholder="留空表示直连播放，可含 {url} 占位符" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="每页条数">
              <el-input v-model="form.pagesize" placeholder="100">
                <template #append>条</template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="请求间隔">
              <el-input v-model="form.interval_sec" placeholder="3">
                <template #append>秒</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="超时时间">
              <el-input v-model="form.timeout" placeholder="30">
                <template #append>秒</template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="重试次数">
              <el-input v-model="form.retry_times" placeholder="2">
                <template #append>次</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>

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
.hint {
  width: 100%;
  margin-top: 2px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.hint.inline {
  margin-left: 8px;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.caret {
  margin-left: 2px;
  font-size: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.danger {
  color: var(--el-color-danger);
}
</style>
