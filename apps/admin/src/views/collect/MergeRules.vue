<script setup lang="ts">
/**
 * 入库合并规则：字段清单、中文名、分组、可选策略全部由服务端 `GET /api/admin/vod-merge-rule`
 * 给出（服务端从 `collect/merge.ts` 的 `MERGE_FIELDS` 生成），页面只负责取值与保存。
 * 布局与其它列表页一致：查询卡片 + 表格卡片 + 分页。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client.ts';
import ProTable from '../../components/ProTable.vue';
import { useTableQuery } from '../../composables/useTableQuery.ts';

interface RuleOption {
  value: string;
  label: string;
}

interface RuleItem {
  key: string;
  label: string;
  hint: string;
  value: string;
  options: RuleOption[];
  isDefault: boolean;
}

interface MergeRuleView {
  mode: 'merge' | 'off';
  items: RuleItem[];
}

const loading = ref(false);
const saving = ref(false);
const mode = ref<'merge' | 'off'>('merge');
const serverMode = ref<'merge' | 'off'>('merge');
const items = ref<RuleItem[]>([]);
/** 页面上的取值 */
const values = reactive<Record<string, string>>({});
/** 服务端当前值，用来判断「有没有未保存的改动」 */
const serverValues = reactive<Record<string, string>>({});

/** 筛选条件与分页跟 URL 绑定 */
const {
  filters,
  page,
  pageSize,
  search: syncSearch,
  reset: resetQuery,
} = useTableQuery({ keyword: '' }, { pageSize: 20 });

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

watch(() => filters.keyword, () => {
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
  syncSearch();
}

function reset(): void {
  resetQuery();
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
          placeholder="字段名 / 键名 / 说明"
          clearable
          style="width: 220px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="toolbar">
        <div class="mode-ctrl">
          <el-radio-group v-model="mode">
            <el-radio-button value="merge">按字段合并</el-radio-button>
            <el-radio-button value="off">关闭（整行覆盖）</el-radio-button>
          </el-radio-group>
        </div>
        <div class="toolbar-right">
          <span v-if="dirtyCount > 0" class="dirty-text">{{ dirtyCount }} 项未保存</span>
          <el-button @click="resetAll">恢复默认</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>

      <ProTable
        :data="rows"
        :total="total"
        :page="page"
        :page-size="pageSize"
        :loading="loading"
        row-key="key"
        border
        stripe
        @update:page="(value: number) => (page = value)"
        @update:page-size="(size: number) => (pageSize = size)"
      >
          <el-table-column prop="label" label="字段" width="120" />
          <el-table-column label="键名" width="150">
            <template #default="{ row }">
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
          <el-table-column label="默认" width="240">
            <template #default="{ row }">
              <div class="default-cell">
                <span>{{ labelOf(row, defaultOf(row)) }}</span>
                <el-tag v-if="changedFromDefault(row)" type="warning" size="small" effect="plain">已改</el-tag>
              </div>
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
      </ProTable>
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
.mode-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  flex: none;
}
.dirty-text {
  margin-right: 12px;
  font-size: 13px;
  color: var(--el-color-warning);
}
.default-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.strategy {
  width: 100%;
}
.code {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
