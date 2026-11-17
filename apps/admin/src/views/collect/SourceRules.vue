<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { buildListQuery, likeValue } from '@lcm/api-client';
import { api, ApiError } from '../../api/client.ts';
import { useTableQuery } from '../../composables/useTableQuery.ts';

interface RuleRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  sourceId: string;
  kind: number;
  fromUrl: string;
  toUrl: string;
  isEnabled: number;
  sort: number;
  createdAt: string;
}

interface SourceOption {
  id: string;
  name: string;
}

interface ApplyPreview {
  needConfirm: boolean;
  total: number;
  affected: number;
}

const items = ref<RuleRow[]>([]);
const sources = ref<SourceOption[]>([]);
const loading = ref(false);
const total = ref(0);
/** 筛选条件与分页跟 URL 绑定 */
const {
  filters,
  page,
  pageSize,
  search: syncSearch,
  reset: resetQuery,
  onPageChange: setPage,
} = useTableQuery({ source_id: '', kind: '', status: '', keyword: '' }, { pageSize: 20 });


const dialogVisible = ref(false);
const dialogTitle = ref('新增规则');
const editingId = ref('');
const saving = ref(false);
const applying = ref('');

const form = reactive({
  source_id: '',
  kind: 1,
  from_url: '',
  to_url: '',
  sort: 0,
  is_enabled: 1,
});

const kindText = (kind: number): string => (kind === 2 ? '图片地址' : '播放地址');

/** 规则表只存 sourceId，列表里按采集源列表翻译成名称。 */
function sourceName(id: string): string {
  return sources.value.find((item) => item.id === id)?.name ?? '—';
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const where: Record<string, unknown> = {};
    if (filters.source_id) where['sourceId'] = filters.source_id;
    if (filters.kind) where['kind'] = Number(filters.kind);
    if (filters.status) where['isEnabled'] = Number(filters.status);
    const keyword = filters.keyword.trim();
    if (keyword) where['fromUrl'] = { $like: likeValue(keyword) };
    const data = await api.get<{ items: RuleRow[]; total: number }>(
      '/source-rule',
      buildListQuery({ take: pageSize.value, skip: (page.value - 1) * pageSize.value, where }),
    );
    items.value = data.items;
    total.value = data.total;
    // 删掉最后一页的最后一条后回退一页，避免停在空页
    if (items.value.length === 0 && total.value > 0 && page.value > 1) {
      page.value -= 1;
      await load();
    }
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

/** 条件变化后从第一页重新查。 */
function search(): void {
  syncSearch();
  void load();
}

function onPageChange(value: number): void {
  setPage(value);
  void load();
}

async function loadSources(): Promise<void> {
  try {
    const data = await api.get<{ items: SourceOption[]; total: number }>(
      '/collect-source',
      buildListQuery({ take: 100, order: { id: 'ASC' } }),
    );
    sources.value = data.items.map((item) => ({ id: item.id, name: item.name }));
  } catch {
    sources.value = [];
  }
}

function resetFilters(): void {
  resetQuery();
  void load();
}

watch(pageSize, () => {
  page.value = 1;
  void load();
});

function openCreate(): void {
  dialogTitle.value = '新增规则';
  editingId.value = '';
  form.source_id = sources.value[0]?.id ?? '';
  form.kind = 1;
  form.from_url = '';
  form.to_url = '';
  form.sort = 0;
  form.is_enabled = 1;
  dialogVisible.value = true;
}

function openEdit(row: RuleRow): void {
  dialogTitle.value = '编辑规则';
  editingId.value = row.id;
  form.source_id = row.sourceId;
  form.kind = row.kind;
  form.from_url = row.fromUrl;
  form.to_url = row.toUrl;
  form.sort = row.sort;
  form.is_enabled = row.isEnabled;
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.source_id) {
    ElMessage.warning('请选择采集源');
    return;
  }
  saving.value = true;
  try {
    const body = {
      sourceId: form.source_id,
      kind: form.kind,
      fromUrl: form.from_url.trim(),
      toUrl: form.to_url.trim(),
      sort: Number(form.sort) || 0,
      isEnabled: form.is_enabled,
    };
    if (editingId.value) await api.put(`/source-rule/${editingId.value}`, body);
    else await api.post('/source-rule', body);
    ElMessage.success('已保存');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggle(row: RuleRow): Promise<void> {
  try {
    const next = row.isEnabled === 1 ? 0 : 1;
    await api.put(`/source-rule/${row.id}`, { isEnabled: next });
    row.isEnabled = next;
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '操作失败');
  }
}

async function remove(row: RuleRow): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除这条规则？只影响之后的采集，已有数据不变。`, '删除规则', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await api.del(`/source-rule/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '删除失败');
  }
}

async function apply(row: RuleRow): Promise<void> {
  applying.value = row.id;
  try {
    const preview = await api.post<ApplyPreview>('/source-rule/apply', { id: row.id, confirm: false });
    applying.value = '';
    if (preview.total === 0) {
      ElMessage.info('没有需要替换的数据');
      return;
    }
    try {
      await ElMessageBox.confirm(
        `将把 ${preview.total} 条数据的「${row.fromUrl}」替换为「${row.toUrl}」，此操作不可撤销。`,
        '重刷历史数据',
        { type: 'warning', confirmButtonText: '开始替换', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
    applying.value = row.id;
    const result = await api.post<ApplyPreview>('/source-rule/apply', { id: row.id, confirm: true });
    ElMessage.success(`已替换 ${result.affected} 条`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '重刷失败');
  } finally {
    applying.value = '';
  }
}

onMounted(() => {
  void loadSources();
  void load();
});
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="search-card">
      <div class="search-bar">
        <el-select v-model="filters.source_id" placeholder="采集源" clearable style="width: 180px" @change="search">
          <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-select v-model="filters.kind" placeholder="类型" clearable style="width: 120px" @change="search">
          <el-option label="播放地址" :value="'1'" />
          <el-option label="图片地址" :value="'2'" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 110px" @change="search">
          <el-option label="启用" :value="'1'" />
          <el-option label="停用" :value="'0'" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="原地址关键词"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <el-button type="primary" @click="openCreate">新增规则</el-button>
        <span class="hint inline">规则在采集写库前自动套用，不影响已有数据；存量数据点「重刷」逐条替换。</span>
      </div>
      <ProTable
        :data="items"
        :total="total"
        :page="page"
        :page-size="pageSize"
        :loading="loading"
        border
        stripe
        @update:page="onPageChange"
        @update:page-size="(size: number) => (pageSize = size)"
      >
<el-table-column label="采集源" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ sourceName(row.sourceId) }}</template>
          </el-table-column>
          <el-table-column label="类型" width="100" align="center">
            <template #default="{ row }">{{ kindText(row.kind) }}</template>
          </el-table-column>
          <el-table-column prop="fromUrl" label="原地址" min-width="240" show-overflow-tooltip />
          <el-table-column prop="toUrl" label="新地址" min-width="240" show-overflow-tooltip />
          <el-table-column prop="sort" label="排序" width="80" align="center" />
          <el-table-column label="启用" width="80" align="center">
            <template #default="{ row }">
              <el-switch :model-value="row.isEnabled === 1" @change="toggle(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" align="center" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button link type="warning" :loading="applying === row.id" @click="apply(row)">重刷</el-button>
                <el-button link type="danger" @click="remove(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty">还没有规则。源站换域名或图床时，在这里加一条，采集时自动替换。</div>
          </template>
              </ProTable>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="采集源">
          <el-select v-model="form.source_id" placeholder="选择采集源" style="width: 100%">
            <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.kind">
            <el-radio :value="1">播放地址</el-radio>
            <el-radio :value="2">图片地址</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="原地址">
          <el-input v-model="form.from_url" placeholder="如 vod.360zyx.vip" />
          <div class="hint">地址里出现这一串就替换，不限开头、出现几次换几次；可省略 https://。</div>
        </el-form-item>
        <el-form-item label="新地址">
          <el-input v-model="form.to_url" placeholder="如 vod1.maowushi.com" />
          <div class="hint">可省略协议，地址自身的 http/https 保持不变。</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input v-model.number="form.sort" style="width: 120px" />
          <span class="hint inline">多条规则按此顺序依次套用，小的先执行。</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
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
  width: auto;
  margin: 0 0 0 8px;
}
.empty {
  padding: 24px 0;
  color: var(--el-text-color-secondary);
}
</style>
