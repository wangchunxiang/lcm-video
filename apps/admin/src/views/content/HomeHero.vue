<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { buildListQuery } from '@lcm/api-client';
import { api } from '../../api/client.ts';
import { formatDateTime } from '../../utils/datetime.ts';

/** 后端 `/home-hero/rows` 的行：配置 + 影片信息 + 当前是否在播 */
interface HeroRow {
  /** BIGINT 主键，服务端按字符串返回 */
  id: string;
  vodId: string;
  vodName: string;
  vodCover: string;
  vodYear: number;
  vodRemarks: string;
  categoryName: string;
  title: string;
  subTitle: string;
  bgImage: string;
  remarks: string;
  sort: number;
  isShow: number;
  startAt: string | null;
  endAt: string | null;
  live: boolean;
}

interface VodOption {
  id: string;
  name: string;
  year: number;
  cover: string;
}

/** 已上满 8 个就不让再加：前台 hero 接口只取前 8 条 */
const MAX_HERO = 8;

const items = ref<HeroRow[]>([]);
const selection = ref<HeroRow[]>([]);
const tableRef = ref<{ clearSelection: () => void } | null>(null);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ keyword: '', status: '' });

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;
const loading = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref('新增轮播位');
const editingId = ref('');

const form = reactive({
  vodId: '',
  title: '',
  subTitle: '',
  bgImage: '',
  remarks: '',
  isShow: 1,
  start_at: '',
  end_at: '',
});

const vodOptions = ref<VodOption[]>([]);
const vodSearching = ref(false);

/** 到 8 个就不能再新增（含已隐藏的位，避免占了位看不见） */
const canCreate = computed(() => total.value < MAX_HERO);

/** 批量操作：hero 位就是「显示 / 隐藏」，不做批量删除，误删会把轮播位整条丢掉 */
async function batchStatus(action: 'show' | 'hide') {
  const ids = selection.value.map((row) => row.id);
  if (ids.length === 0) return;
  const isShow = action === 'show' ? 1 : 0;
  try {
    for (const id of ids) {
      await api.put(`/home-hero/${id}`, { isShow });
    }
    ElMessage.success(action === 'show' ? `已显示 ${ids.length} 个轮播位` : `已隐藏 ${ids.length} 个轮播位`);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function load() {
  loading.value = true;
  try {
    const data = await api.post<{ items: HeroRow[]; total: number }>('/home-hero/rows', {
      keyword: filters.keyword.trim(),
      status: filters.status,
      take: pageSize.value,
      skip: (page.value - 1) * pageSize.value,
    });
    items.value = data.items;
    total.value = data.total;
    selection.value = [];
    tableRef.value?.clearSelection();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载轮播位失败');
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

/** 选片：按片名远程搜索（后台 /vod 列表自带 where 过滤） */
async function searchVod(keyword: string) {
  const text = keyword.trim();
  if (!text) {
    vodOptions.value = [];
    return;
  }
  vodSearching.value = true;
  try {
    const query = buildListQuery({
      take: 20,
      skip: 0,
      where: { name: { $like: `%${text}%` } },
      order: { id: 'DESC' },
    });
    const data = await api.get<{ items: VodOption[]; total: number }>('/vod', query);
    vodOptions.value = data.items;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '搜索影片失败');
  } finally {
    vodSearching.value = false;
  }
}

function resetForm() {
  form.vodId = '';
  form.title = '';
  form.subTitle = '';
  form.bgImage = '';
  form.remarks = '';
  form.isShow = 1;
  form.start_at = '';
  form.end_at = '';
  vodOptions.value = [];
  editingId.value = '';
}

function openCreate() {
  if (!canCreate.value) return ElMessage.warning(`最多 ${MAX_HERO} 个轮播位，请先删掉不用的`);
  resetForm();
  dialogTitle.value = '新增轮播位';
  dialogVisible.value = true;
}

function openEdit(row: HeroRow) {
  resetForm();
  editingId.value = row.id;
  form.vodId = row.vodId;
  form.title = row.title;
  form.subTitle = row.subTitle;
  form.bgImage = row.bgImage;
  form.remarks = row.remarks;
  form.isShow = row.isShow;
  form.start_at = row.startAt ? formatDateTime(row.startAt) : '';
  form.end_at = row.endAt ? formatDateTime(row.endAt) : '';
  vodOptions.value = [{ id: row.vodId, name: row.vodName, year: row.vodYear, cover: row.vodCover }];
  dialogTitle.value = '编辑轮播位';
  dialogVisible.value = true;
}

/** DTO 要 ISO 8601；空串表示不限时间 */
function toIso(value: string): string | null {
  if (!value) return null;
  return new Date(value.replace(' ', 'T')).toISOString();
}

async function submit() {
  if (!form.vodId) return ElMessage.warning('请选择影片');

  const payload = {
    vodId: form.vodId,
    title: form.title.trim(),
    subTitle: form.subTitle.trim(),
    bgImage: form.bgImage.trim(),
    remarks: form.remarks.trim(),
    isShow: form.isShow,
    startAt: toIso(form.start_at),
    endAt: toIso(form.end_at),
  };

  try {
    if (editingId.value !== '') {
      await api.put(`/home-hero/${editingId.value}`, payload);
    } else {
      await api.post('/home-hero', payload);
    }
    ElMessage.success('已保存');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  }
}

function onSelectionChange(rows: HeroRow[]) {
  selection.value = rows;
}

async function toggleStatus(row: HeroRow) {
  const next = row.isShow === 1 ? 0 : 1;
  try {
    await api.put(`/home-hero/${row.id}`, { isShow: next });
    ElMessage.success(next === 1 ? '已显示' : '已隐藏');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
    await load();
  }
}

/**
 * 上移/下移：把当前列表的 sort 重排成 10/20/30…，只提交真正变了的那几行。
 * hero 位最多 8 个、默认一页装得下，所以按当前页重排就够。
 */
async function move(row: HeroRow, delta: -1 | 1) {
  const list = [...items.value];
  const index = list.findIndex((item) => item.id === row.id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return;

  const current = list[index];
  if (!current) return;
  list.splice(index, 1);
  list.splice(target, 0, current);

  const changed = list
    .map((item, i) => ({ id: item.id, sort: (i + 1) * 10, before: item.sort }))
    .filter((item) => item.sort !== item.before);

  try {
    await Promise.all(changed.map((item) => api.put(`/home-hero/${item.id}`, { sort: item.sort })));
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '排序失败');
  }
}

async function remove(row: HeroRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.vodName}」这个轮播位吗？`, '删除轮播位', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  try {
    await api.del(`/home-hero/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

/** 时间窗口的「为什么不显示」，让人一眼看出是没到时间还是过期了 */
function stateOf(row: HeroRow): { text: string; type: 'success' | 'info' | 'warning' } {
  if (row.isShow !== 1) return { text: '已隐藏', type: 'info' };
  if (row.live) return { text: '在播', type: 'success' };
  const now = Date.now();
  const start = row.startAt ? new Date(row.startAt).getTime() : 0;
  const end = row.endAt ? new Date(row.endAt).getTime() : 0;
  if (start && start > now) return { text: '未到时间', type: 'warning' };
  if (end && end <= now) return { text: '已过期', type: 'info' };
  return { text: '未知', type: 'info' };
}

onMounted(() => {
  void load();
  if (wrapRef.value) {
    resizeObserver = new ResizeObserver(() => {
      tableHeight.value = wrapRef.value?.clientHeight ?? 400;
    });
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
      <el-input
        v-model="filters.keyword"
        placeholder="片名 / 覆盖标题"
        clearable
        style="width: 200px"
        @keyup.enter="search"
      />
      <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 120px">
        <el-option label="显示" value="1" />
        <el-option label="隐藏" value="0" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </div>
    <div class="hint">
      共 {{ total }} / {{ MAX_HERO }} 个轮播位，前台按排序从小到大的顺序轮播；一个都没配（或都不在时间窗口内）时，首页回落到「今日更新」前 8 部。
    </div>
  </el-card>

  <el-card shadow="never" class="table-card">
    <div class="toolbar">
      <el-button type="primary" :disabled="!canCreate" @click="openCreate">新增轮播位</el-button>
      <el-button type="success" :disabled="selection.length === 0" @click="batchStatus('show')">批量显示</el-button>
      <el-button type="warning" :disabled="selection.length === 0" @click="batchStatus('hide')">批量隐藏</el-button>
    </div>

    <div ref="wrapRef" class="table-wrap">
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="items"
      border
      stripe
      :height="tableHeight"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="44" fixed="left" />
      <el-table-column label="排序" width="88" align="center" fixed="left">
        <template #default="{ row, $index }">
          <div class="row-actions">
            <el-button link type="primary" :disabled="$index === 0" @click="move(row, -1)">↑</el-button>
            <el-button link type="primary" :disabled="$index === items.length - 1" @click="move(row, 1)">↓</el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="影片" min-width="260">
        <template #default="{ row }">
          <div class="vod-cell">
            <img v-if="row.vodCover" :src="row.vodCover" class="cover" alt="" />
            <div class="vod-text">
              <div class="vod-name">
                {{ row.vodName }}
                <el-tag v-if="row.title" size="small" type="warning">已改标题</el-tag>
                <el-tag v-if="row.bgImage" size="small" type="info">自定义横幅</el-tag>
                <el-tag v-if="row.remarks" size="small" type="info">角标</el-tag>
              </div>
              <div class="muted">
                {{ [row.categoryName, row.vodYear || '', row.vodRemarks].filter(Boolean).join(' · ') }}
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="categoryName" label="分类" width="110" show-overflow-tooltip />
      <el-table-column label="覆盖值" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.title || row.remarks || row.subTitle || row.bgImage" class="muted">
            <span v-if="row.title">标题：{{ row.title }}；</span>
            <span v-if="row.remarks">角标：{{ row.remarks }}；</span>
            <span v-if="row.subTitle">副标题：{{ row.subTitle }}</span>
            <span v-if="row.bgImage">横幅：{{ row.bgImage }}</span>
          </span>
          <span v-else class="muted">全部用影片自己的值</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="stateOf(row).type" size="small">{{ stateOf(row).text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="显示" width="76" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.isShow === 1" @change="toggleStatus(row)" />
        </template>
      </el-table-column>
      <el-table-column label="上线 / 下线" width="180" align="center">
        <template #default="{ row }">
          <div class="time-cell">
            <span>{{ row.startAt ? formatDateTime(row.startAt) : '立即' }}</span>
            <span>{{ row.endAt ? formatDateTime(row.endAt) : '长期' }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <span class="muted">还没有配置轮播位，首页正在用「今日更新」前 8 部兜底。</span>
      </template>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="影片" required>
          <el-select
            v-model="form.vodId"
            filterable
            remote
            :remote-method="searchVod"
            :loading="vodSearching"
            placeholder="输入片名搜索"
            style="width: 100%"
          >
            <el-option
              v-for="option in vodOptions"
              :key="option.id"
              :label="`${option.name}${option.year ? ` (${option.year})` : ''}`"
              :value="option.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="显示标题">
          <el-input v-model="form.title" maxlength="255" placeholder="留空使用影片名" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="form.subTitle" maxlength="255" placeholder="留空不显示" />
          <div class="hint">当前前台 hero 只显示「标题 + 一行元信息」，副标题先存着，暂不渲染。</div>
        </el-form-item>
        <el-form-item label="横幅图">
          <el-input v-model="form.bgImage" maxlength="1000" placeholder="留空使用影片封面" />
          <div class="hint">hero 是通栏放大，2:3 海报铺满会被裁掉上下，建议填 16:9 或更宽的图。</div>
        </el-form-item>
        <el-form-item label="角标文案">
          <el-input v-model="form.remarks" maxlength="255" placeholder="留空使用影片备注" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="定时上线">
              <el-date-picker
                v-model="form.start_at"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                placeholder="留空表示立即"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="定时下线">
              <el-date-picker
                v-model="form.end_at"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                placeholder="留空表示长期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="显示">
          <el-switch v-model="form.isShow" :active-value="1" :inactive-value="0" />
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
.table-wrap {
  flex: 1;
  min-height: 0;
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
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.muted {
  color: var(--el-text-color-secondary);
}
.vod-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}
.vod-cell .cover {
  width: 36px;
  height: 54px;
  object-fit: cover;
  border-radius: 4px;
  flex: none;
}
.vod-cell .vod-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.vod-cell .vod-text {
  min-width: 0;
}
.time-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
