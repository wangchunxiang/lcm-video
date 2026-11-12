<script setup lang="ts">
/**
 * 入库合并规则：字段清单、中文名、分组、可选策略全部由服务端 `GET /api/admin/vod-merge-rule`
 * 给出（服务端从 `collect/merge.ts` 的 `MERGE_FIELDS` 生成），页面只负责取值与保存。
 * 布局与其它列表页一致：查询卡片 + 表格卡片 + 分页。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';

interface RuleOption {
  value: string;
  label: string;
}

interface RuleItem {
  key: string;
  label: string;
  group: string;
  hint: string;
  value: string;
  options: RuleOption[];
  isDefault: boolean;
}

interface FixedRow {
  label: string;
  hint: string;
}

interface MergeRuleView {
  mode: 'merge' | 'off';
  updatedAt: string | null;
  items: RuleItem[];
  fixed: FixedRow[];
}

const loading = ref(false);
const saving = ref(false);
const mode = ref<'merge' | 'off'>('merge');
const serverMode = ref<'merge' | 'off'>('merge');
const items = ref<RuleItem[]>([]);
const fixed = ref<FixedRow[]>([]);
const updatedAt = ref<string | null>(null);
const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let resizeObserver: ResizeObserver | null = null;
/** 页面上的取值 */
const values = reactive<Record<string, string>>({});
/** 服务端当前值，用来判断「有没有未保存的改动」 */
const serverValues = reactive<Record<string, string>>({});

const filters = reactive({ keyword: '', group: '' });
const onlyChanged = ref(false);
const page = ref(1);
const pageSize = ref(20);

const groups = computed(() => [...new Set(items.value.map((item) => item.group))]);
const mergeOn = computed(() => mode.value === 'merge');

/** 每个字段的默认策略就是服务端 options 的第一项（与 MERGE_FIELDS 的 strategies[0] 一致） */
function defaultOf(item: RuleItem): string {
  return item.options[0]?.value ?? 'keep';
}

function labelOf(item: RuleItem, value: string): string {
  return item.options.find((option) => option.value === value)?.label ?? value;
}

function changedFromDefault(item: RuleItem): boolean {
  return values[item.key] !== defaultOf(item);
}

function dirty(item: RuleItem): boolean {
  return values[item.key] !== serverValues[item.key];
}

const dirtyCount = computed(
  () => items.value.filter((item) => dirty(item)).length + (mode.value !== serverMode.value ? 1 : 0),
);

const filtered = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  return items.value.filter((item) => {
    if (filters.group !== '' && item.group !== filters.group) return false;
    if (onlyChanged.value && !changedFromDefault(item)) return false;
    if (keyword === '') return true;
    return (
      item.label.toLowerCase().includes(keyword) ||
      item.key.toLowerCase().includes(keyword) ||
      item.hint.toLowerCase().includes(keyword)
    );
  });
});

const total = computed(() => filtered.value.length);
const rows = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
);

watch([() => filters.keyword, () => filters.group, onlyChanged], () => {
  page.value = 1;
});

watch(pageSize, () => {
  page.value = 1;
});

watch(total, () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value));
  if (page.value > maxPage) page.value = maxPage;
});

function applyView(view: MergeRuleView): void {
  mode.value = view.mode;
  serverMode.value = view.mode;
  items.value = view.items;
  fixed.value = view.fixed;
  updatedAt.value = view.updatedAt;
  for (const key of Object.keys(values)) delete values[key];
  for (const key of Object.keys(serverValues)) delete serverValues[key];
  for (const item of view.items) {
    values[item.key] = item.value;
    serverValues[item.key] = item.value;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    applyView(await api.get<MergeRuleView>('/vod-merge-rule'));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载入库规则失败');
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
}

function reset(): void {
  filters.keyword = '';
  filters.group = '';
  onlyChanged.value = false;
  page.value = 1;
}

function resetOne(item: RuleItem): void {
  values[item.key] = defaultOf(item);
}

async function resetAll(): Promise<void> {
  try {
    await ElMessageBox.confirm('把所有字段恢复成默认策略？保存前不会写入数据库。', '恢复默认', {
      type: 'warning',
      confirmButtonText: '恢复',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  for (const item of items.value) values[item.key] = defaultOf(item);
  mode.value = 'merge';
}

async function save(): Promise<void> {
  if (dirtyCount.value === 0) {
    ElMessage.info('没有需要保存的改动');
    return;
  }
  saving.value = true;
  try {
    await api.put<{ saved: number; updatedAt: string }>('/vod-merge-rule', {
      mode: mode.value,
      items: items.value.map((item) => ({
        ruleKey: item.key,
        ruleValue: values[item.key] ?? item.value,
      })),
    });
    ElMessage.success('入库规则已保存，下一轮采集生效');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

function formatTime(value: string | null): string {
  if (value === null || value === '') return '尚未保存过';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
          placeholder="字段名 / 键名 / 说明"
          clearable
          style="width: 220px"
          @keyup.enter="search"
        />
        <el-select v-model="filters.group" placeholder="全部分组" clearable style="width: 140px">
          <el-option v-for="group in groups" :key="group" :label="group" :value="group" />
        </el-select>
        <el-checkbox v-model="onlyChanged">只看已修改</el-checkbox>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <div class="mode-ctrl">
          <span class="mode-label">合并模式</span>
          <el-radio-group v-model="mode">
            <el-radio-button value="merge">按字段合并</el-radio-button>
            <el-radio-button value="off">关闭（整行覆盖）</el-radio-button>
          </el-radio-group>
          <span class="mode-hint">
            {{ mergeOn ? '同一条影片被多个源命中时，按下表逐个字段取舍' : '后采到的源会整行覆盖，下表策略不生效' }}
          </span>
        </div>
        <div class="toolbar-right">
          <el-tag v-if="dirtyCount > 0" type="warning" effect="plain">{{ dirtyCount }} 项未保存</el-tag>
          <span class="saved-at">上次保存：{{ formatTime(updatedAt) }}</span>
          <el-button @click="resetAll">恢复默认</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>

      <div ref="wrapRef" class="table-wrap">
        <el-table v-loading="loading" :data="rows" row-key="key" border stripe :height="tableHeight">
          <el-table-column label="分组" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="info" effect="plain">{{ row.group }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="字段" min-width="150">
            <template #default="{ row }">
              <span>{{ row.label }}</span>
              <span class="code">{{ row.key }}</span>
            </template>
          </el-table-column>
          <el-table-column label="当前策略" width="230">
            <template #default="{ row }">
              <el-select v-model="values[row.key]" size="default" class="strategy">
                <el-option
                  v-for="option in row.options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="默认" width="180">
            <template #default="{ row }">
              <span>{{ labelOf(row, defaultOf(row)) }}</span>
              <el-tag v-if="changedFromDefault(row)" type="warning" size="small" effect="plain">已改</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="hint" label="说明" min-width="280" show-overflow-tooltip />
          <el-table-column label="操作" width="110" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" :disabled="!changedFromDefault(row)" @click="resetOne(row)">
                恢复默认
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
        @current-change="(value: number) => (page = value)"
        @size-change="(size: number) => (pageSize = size)"
      />

      <div class="fixed-note">
        <span class="fixed-title">不参与合并：</span>
        <span v-for="row in fixed" :key="row.label" class="fixed-item">
          <b>{{ row.label }}</b>
          <span class="muted">（{{ row.hint }}）</span>
        </span>
      </div>
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
  gap: 12px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.mode-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.mode-label {
  color: var(--el-text-color-regular);
}
.mode-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.saved-at {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.strategy {
  width: 100%;
}
.code {
  margin-left: 6px;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.fixed-note {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
  font-size: 12px;
  line-height: 22px;
  color: var(--el-text-color-regular);
}
.fixed-title {
  margin-right: 4px;
}
.fixed-item {
  margin-right: 16px;
}
.fixed-item b {
  font-weight: 500;
  margin-right: 6px;
}
.muted {
  color: var(--el-text-color-secondary);
}
</style>
