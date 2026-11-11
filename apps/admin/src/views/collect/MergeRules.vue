<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client.ts';

interface FieldOption {
  value: string;
  label: string;
}

interface FieldRow {
  key: string;
  label: string;
  hint: string;
  value: string;
  options: FieldOption[];
}

interface FixedRow {
  label: string;
  hint: string;
}

interface FieldDef {
  key: string;
  label: string;
  strategies: string[];
  hint: string;
}

interface MergeConfig {
  mode: string;
  fields: Record<string, string>;
}

/** 入库规则存在 lcm_setting 的 merge_rules 键里 */
const MERGE_CONFIG_KEY = 'merge_rules';

/** 策略中文名，与服务端 apps/server/src/modules/collect/merge.ts 的 STRATEGY_LABELS 保持一致 */
const STRATEGY_LABELS: Record<string, string> = {
  keep: '保留旧值',
  new: '总是覆盖',
  nonempty: '新值非空才覆盖',
  longer: '取较长',
  more: '按人数取多',
  larger: '取较大数值',
  progress: '按更新进度比较',
  date: '旧值空才补',
  cover: '旧图为空或已失效才换',
};

/** 可配置字段，与服务端 MERGE_FIELDS 保持一致（没有接口吐出这份定义） */
const MERGE_FIELDS: FieldDef[] = [
  { key: 'progress', label: '更新进度', strategies: ['progress', 'keep'], hint: '完结 > 连载 > 标记；连载按集数取大，标记之间保留旧值' },
  { key: 'episodeCount', label: '集数', strategies: ['larger', 'new', 'keep'], hint: '默认取较大值，避免源站数据残缺把集数改小' },
  { key: 'cover', label: '封面', strategies: ['cover', 'nonempty', 'new', 'keep'], hint: '旧图缺失、旧图域名已失效、或同源更新时替换' },
  { key: 'subName', label: '副标题', strategies: ['nonempty', 'longer', 'new', 'keep'], hint: '一句话卖点，默认新值非空才覆盖' },
  { key: 'intro', label: '简介', strategies: ['longer', 'nonempty', 'new', 'keep'], hint: '默认取较长的一条' },
  { key: 'content', label: '剧情', strategies: ['longer', 'nonempty', 'new', 'keep'], hint: '默认取较长的一条' },
  { key: 'actor', label: '演员', strategies: ['more', 'nonempty', 'new', 'keep'], hint: '按人数取多，人数相同保留旧值' },
  { key: 'director', label: '导演', strategies: ['more', 'nonempty', 'new', 'keep'], hint: '按人数取多' },
  { key: 'writer', label: '编剧', strategies: ['more', 'nonempty', 'new', 'keep'], hint: '按人数取多' },
  { key: 'area', label: '地区', strategies: ['nonempty', 'new', 'keep'], hint: '默认旧值空才补' },
  { key: 'lang', label: '语言', strategies: ['nonempty', 'new', 'keep'], hint: '默认旧值空才补' },
  { key: 'releaseDate', label: '上映日期', strategies: ['date', 'nonempty', 'new', 'keep'], hint: '旧值空或旧值不是日期、新值是日期时才替换' },
];

/** 不参与合并的字段，页面上只做说明 */
const FIXED_FIELDS: FixedRow[] = [
  { label: '片名 / 判重键', hint: 'name、nameHash、nameHashLoose' },
  { label: '分类 / 状态', hint: 'categoryId、categoryPid、status、createdAt' },
  { label: '年份', hint: '旧值有值就保留，旧值为 0 才补' },
];

function defaultFields(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of MERGE_FIELDS) out[field.key] = field.strategies[0] ?? 'keep';
  return out;
}

const DEFAULT_CONFIG: MergeConfig = { mode: 'merge', fields: defaultFields() };

const loading = ref(false);
const saving = ref(false);
const mode = ref('merge');
const fields = ref<FieldRow[]>([]);
const fixed = ref<FixedRow[]>(FIXED_FIELDS);
const defaults = reactive<{ mode: string; fields: Record<string, string> }>({
  mode: DEFAULT_CONFIG.mode,
  fields: { ...DEFAULT_CONFIG.fields },
});
const values = reactive<Record<string, string>>({});

const mergeOn = computed(() => mode.value === 'merge');

/** 与服务端 normalizeMergeConfig 同规则：未知字段丢弃、非法策略回退默认 */
function normalizeConfig(raw: unknown): MergeConfig {
  const config: MergeConfig = { mode: DEFAULT_CONFIG.mode, fields: { ...DEFAULT_CONFIG.fields } };
  if (raw === null || raw === undefined || typeof raw !== 'object') return config;
  const input = raw as { mode?: unknown; fields?: unknown };
  if (input.mode === 'off' || input.mode === 'merge') config.mode = input.mode;
  if (input.fields !== undefined && input.fields !== null && typeof input.fields === 'object') {
    for (const [key, value] of Object.entries(input.fields as Record<string, unknown>)) {
      const def = MERGE_FIELDS.find((field) => field.key === key);
      if (!def) continue;
      if (typeof value === 'string' && def.strategies.includes(value)) config.fields[key] = value;
    }
  }
  return config;
}

function buildFields(config: MergeConfig): FieldRow[] {
  return MERGE_FIELDS.map((def) => ({
    key: def.key,
    label: def.label,
    hint: def.hint,
    value: config.fields[def.key] ?? def.strategies[0] ?? 'keep',
    options: def.strategies.map((strategy) => ({
      value: strategy,
      label: STRATEGY_LABELS[strategy] ?? strategy,
    })),
  }));
}

function applyConfig(config: MergeConfig): void {
  mode.value = config.mode;
  fields.value = buildFields(config);
  for (const key of Object.keys(values)) delete values[key];
  for (const [key, value] of Object.entries(config.fields)) values[key] = value;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const map = await api.post<Record<string, string>>('/setting/map');
    const raw = (map[MERGE_CONFIG_KEY] ?? '').trim();
    let config: MergeConfig = DEFAULT_CONFIG;
    if (raw) {
      try {
        config = normalizeConfig(JSON.parse(raw) as unknown);
      } catch {
        config = DEFAULT_CONFIG;
      }
    }
    applyConfig(config);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载入库规则失败');
    applyConfig(DEFAULT_CONFIG);
  } finally {
    loading.value = false;
  }
}

function resetToDefault(): void {
  mode.value = defaults.mode;
  for (const [key, value] of Object.entries(defaults.fields)) values[key] = value;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const value = JSON.stringify({ mode: mode.value, fields: { ...values } });
    await api.post<{ saved: number }>('/setting/save-many', {
      entries: [{ key: MERGE_CONFIG_KEY, value }],
    });
    ElMessage.success('入库规则已保存，下一轮采集生效');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
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
        <div v-for="field in fields" :key="field.key" class="field" :class="{ off: !mergeOn }">
          <label class="field-label">{{ field.label }}</label>
          <div class="field-ctrl">
            <el-select v-model="values[field.key]" size="default" :disabled="!mergeOn" class="strategy">
              <el-option
                v-for="option in field.options"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <div class="field-hint">{{ field.hint }}</div>
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
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding: 14px 0 16px;
  border-top: 1px solid var(--el-border-color);
}
</style>
