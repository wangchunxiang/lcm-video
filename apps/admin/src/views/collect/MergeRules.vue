<script setup lang="ts">
/**
 * 入库合并规则：字段清单、中文名、可选策略全部由服务端 `GET /api/admin/vod-merge-rule`
 * 给出（服务端从 `collect/merge.ts` 的 `MERGE_FIELDS` 生成），页面只负责取值与保存。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client.ts';

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
const items = ref<RuleItem[]>([]);
const fixed = ref<FixedRow[]>([]);
const updatedAt = ref<string | null>(null);
const values = reactive<Record<string, string>>({});

const mergeOn = computed(() => mode.value === 'merge');

/** 每个字段的默认策略就是服务端 options 的第一项（与 MERGE_FIELDS 的 strategies[0] 一致） */
function defaultValue(item: RuleItem): string {
  return item.options[0]?.value ?? 'keep';
}

function applyView(view: MergeRuleView): void {
  mode.value = view.mode;
  items.value = view.items;
  fixed.value = view.fixed;
  updatedAt.value = view.updatedAt;
  for (const key of Object.keys(values)) delete values[key];
  for (const item of view.items) values[item.key] = item.value;
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

function resetToDefault(): void {
  mode.value = 'merge';
  for (const item of items.value) values[item.key] = defaultValue(item);
}

async function save(): Promise<void> {
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

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="page">
    <el-card shadow="never" class="rules-card">
      <div class="mode-row">
        <label class="field-label">合并模式</label>
        <div class="mode-ctrl">
          <el-radio-group v-model="mode">
            <el-radio-button value="merge">按字段合并</el-radio-button>
            <el-radio-button value="off">关闭（整行覆盖）</el-radio-button>
          </el-radio-group>
          <span class="mode-hint">
            {{ mergeOn ? '同一条影片被多个源命中时，按下表逐个字段取舍' : '后采到的源会整行覆盖，和以前一样' }}
          </span>
        </div>
      </div>

      <div class="field-grid">
        <div v-for="item in items" :key="item.key" class="field" :class="{ off: !mergeOn }">
          <label class="field-label">{{ item.label }}</label>
          <div class="field-ctrl">
            <el-select v-model="values[item.key]" size="default" :disabled="!mergeOn" class="strategy">
              <el-option
                v-for="option in item.options"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <div class="field-hint">{{ item.hint }}</div>
          </div>
        </div>
      </div>

      <div class="fixed-row">
        <label class="field-label">不参与合并</label>
        <div class="fixed-ctrl">
          <div v-for="row in fixed" :key="row.label" class="fixed-item">
            <span class="fixed-label">{{ row.label }}</span>
            <span class="fixed-hint">{{ row.hint }}</span>
          </div>
        </div>
      </div>

      <div class="card-foot">
        <span class="saved-at">上次保存：{{ formatTime(updatedAt) }}</span>
        <el-button :disabled="saving" @click="resetToDefault">恢复默认</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}
.rules-card :deep(.el-card__body) {
  padding: 16px 24px 0;
}
.mode-row,
.fixed-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 0;
}
.field-label {
  flex: none;
  width: 96px;
  text-align: right;
  line-height: 32px;
  color: var(--el-text-color-regular);
}
.mode-ctrl {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.mode-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 32px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 0;
  transition: opacity 0.18s ease;
}
.field.off {
  opacity: 0.55;
}
.field-ctrl {
  flex: 1;
  min-width: 0;
}
.strategy {
  width: 200px;
}
.field-hint {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}
.fixed-row {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.fixed-ctrl {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fixed-item {
  font-size: 12px;
  line-height: 22px;
  color: var(--el-text-color-secondary);
}
.fixed-label {
  color: var(--el-text-color-regular);
  margin-right: 8px;
}
.card-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding: 14px 0 16px;
  border-top: 1px solid var(--el-border-color);
}
.saved-at {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
