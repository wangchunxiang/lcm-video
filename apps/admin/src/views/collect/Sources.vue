<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, ApiError } from '../../api/client.ts';

interface SourceRow {
  id: number;
  name: string;
  apiUrl: string;
  apiFormat: string;
  apiParams: string;
  parseUrl: string;
  sort: number;
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
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ keyword: '', status: '' });
const loading = ref(false);
const testing = ref(0);
const dialogVisible = ref(false);
const dialogTitle = ref('新增采集源');
const editingId = ref(0);

const form = reactive({
  name: '',
  api_url: '',
  api_format: 'json',
  api_params: '',
  parse_url: '',
  sort: 0,
  is_enabled: 1,
  pagesize: 100,
  interval_sec: 3,
  timeout: 30,
  retry_times: 2,
});

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value) });
    if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
    if (filters.status !== '') params.set('status', filters.status);
    const data = await api.get<{ items: SourceRow[]; total: number }>(`/sources?${params.toString()}`);
    items.value = data.items;
    total.value = data.total;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载采集源失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void load();
}

function reset() {
  filters.keyword = '';
  filters.status = '';
  search();
}

function onPageChange(next: number) {
  page.value = next;
  void load();
}

function resetForm() {
  form.name = '';
  form.api_url = '';
  form.api_format = 'json';
  form.api_params = '';
  form.parse_url = '';
  form.sort = 0;
  form.is_enabled = 1;
  form.pagesize = 100;
  form.interval_sec = 3;
  form.timeout = 30;
  form.retry_times = 2;
  editingId.value = 0;
}

function openCreate() {
  resetForm();
  dialogTitle.value = '新增采集源';
  dialogVisible.value = true;
}

function openEdit(row: SourceRow) {
  resetForm();
  editingId.value = row.id;
  form.name = row.name;
  form.api_url = row.apiUrl;
  form.api_format = row.apiFormat;
  form.api_params = row.apiParams;
  form.parse_url = row.parseUrl;
  form.sort = row.sort;
  form.is_enabled = row.isEnabled;
  form.pagesize = row.pagesize;
  form.interval_sec = row.intervalSec;
  form.timeout = row.timeout;
  form.retry_times = row.retryTimes;
  dialogTitle.value = '编辑采集源';
  dialogVisible.value = true;
}

async function submit() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称');
  if (!/^https?:\/\//i.test(form.api_url.trim())) return ElMessage.warning('接口地址必须以 http:// 或 https:// 开头');

  try {
    if (editingId.value > 0) {
      await api.put(`/sources/${editingId.value}`, form);
    } else {
      await api.post('/sources', form);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

async function testSource(row: SourceRow) {
  testing.value = row.id;
  try {
    const data = await api.post<{ ok: boolean; elapsed_ms: number; categories: number; sample: string[]; message?: string }>(
      `/sources/${row.id}/test`,
    );
    if (data.ok) {
      ElMessage.success(`接口正常，耗时 ${data.elapsed_ms}ms，返回 ${data.categories} 个分类`);
    } else {
      ElMessage.error(data.message ?? '接口返回异常');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '测试失败');
  } finally {
    testing.value = 0;
  }
}

function toBody(row: SourceRow, patch: Partial<Record<string, unknown>> = {}) {
  return {
    name: row.name,
    api_url: row.apiUrl,
    api_format: row.apiFormat,
    api_params: row.apiParams,
    parse_url: row.parseUrl,
    sort: row.sort,
    is_enabled: row.isEnabled,
    interval_sec: row.intervalSec,
    pagesize: row.pagesize,
    timeout: row.timeout,
    retry_times: row.retryTimes,
    ...patch,
  };
}

async function toggleStatus(row: SourceRow) {
  const next = row.isEnabled === 1 ? 0 : 1;
  try {
    await api.put(`/sources/${row.id}`, toBody(row, { is_enabled: next }));
    ElMessage.success(next === 1 ? '已启用' : '已停用');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

async function remove(row: SourceRow) {
  try {
    await ElMessageBox.confirm(`确定删除采集源「${row.name}」吗？`, '删除采集源', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  try {
    const data = await api.del<{ id: number; plays: number }>(`/sources/${row.id}`);
    ElMessage.success(`已删除，同时清理了 ${data.plays} 条线路`);
    await load();
  } catch (error) {
    if (error instanceof ApiError && error.code === 409) {
      try {
        await ElMessageBox.confirm(
          `${error.message}，删除后将同时清理这些线路，确定继续吗？`,
          '确认删除',
          { type: 'warning', confirmButtonText: '继续删除', cancelButtonText: '取消' },
        );
      } catch {
        return;
      }
      try {
        const data = await api.del<{ id: number; plays: number }>(`/sources/${row.id}?force=1`);
        ElMessage.success(`已删除，同时清理了 ${data.plays} 条线路`);
        await load();
      } catch (inner) {
        ElMessage.error(inner instanceof Error ? inner.message : '删除失败');
      }
      return;
    }
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(load);
</script>

<template>
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

  <el-card shadow="never">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增采集源</el-button>
    </div>

    <el-table v-loading="loading" :data="items" border stripe>
      <el-table-column prop="name" label="名称" width="110" show-overflow-tooltip />
      <el-table-column prop="apiUrl" label="接口地址" min-width="240" show-overflow-tooltip />
      <el-table-column prop="apiFormat" label="格式" width="70" align="center" />
      <el-table-column label="解析接口" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.parseUrl">{{ row.parseUrl }}</span>
          <span v-else class="muted">未配置（直连播放）</span>
        </template>
      </el-table-column>
      <el-table-column label="页大小" width="80" align="center">
        <template #default="{ row }">{{ row.pagesize }}</template>
      </el-table-column>
      <el-table-column label="间隔" width="70" align="center">
        <template #default="{ row }">{{ row.intervalSec }}s</template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.isEnabled === 1" @change="toggleStatus(row)" />
        </template>
      </el-table-column>
      <el-table-column label="最后同步" width="165">
        <template #default="{ row }">
          <el-tooltip v-if="row.lastSyncStatus !== 0" :content="row.lastSyncMsg || '无'">
            <span :class="row.lastSyncStatus === 2 ? 'danger' : ''">{{ row.lastSyncAt || '—' }}</span>
          </el-tooltip>
          <span v-else class="muted">未同步</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :loading="testing === row.id" @click="testSource(row)">测试</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：西瓜资源" />
        </el-form-item>
        <el-form-item label="接口地址" required>
          <el-input v-model="form.api_url" placeholder="https://example.com/api.php/provide/vod/" />
        </el-form-item>
        <el-form-item label="返回格式">
          <el-radio-group v-model="form.api_format">
            <el-radio value="json">JSON</el-radio>
            <el-radio value="xml">XML</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="额外参数">
          <el-input v-model="form.api_params" placeholder="如 ac=list&amp;t=1，可留空" />
          <div class="hint">不能包含 ac、pg、pagesize、at、h，这些由程序控制</div>
        </el-form-item>
        <el-form-item label="解析接口">
          <el-input v-model="form.parse_url" placeholder="留空表示直连播放，可含 {url} 占位符" />
        </el-form-item>
        <el-form-item label="每页条数">
          <el-input-number v-model="form.pagesize" :min="1" :max="100" />
          <span class="hint inline">接口上限 100</span>
        </el-form-item>
        <el-form-item label="请求间隔">
          <el-input-number v-model="form.interval_sec" :min="1" :max="600" />
          <span class="hint inline">秒，上次请求结束到下次开始</span>
        </el-form-item>
        <el-form-item label="超时时间">
          <el-input-number v-model="form.timeout" :min="1" :max="300" />
          <span class="hint inline">秒</span>
        </el-form-item>
        <el-form-item label="重试次数">
          <el-input-number v-model="form.retry_times" :min="0" :max="10" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
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
</template>

<style scoped>
.search-card {
  margin-bottom: 12px;
}
.search-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.hint.inline {
  margin-left: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.danger {
  color: var(--el-color-danger);
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
