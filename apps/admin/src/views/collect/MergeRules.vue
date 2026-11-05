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

interface RulesPayload {
  mode: string;
  fields: FieldRow[];
  fixed: FixedRow[];
  default_mode: string;
  default_fields: Record<string, string>;
}

const loading = ref(false);
const saving = ref(false);
const mode = ref('merge');
const fields = ref<FieldRow[]>([]);
const fixed = ref<FixedRow[]>([]);
const defaults = reactive<{ mode: string; fields: Record<string, string> }>({
  mode: 'merge',
  fields: {},
});
const values = reactive<Record<string, string>>({});

const mergeOn = computed(() => mode.value === 'merge');

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await api.get<RulesPayload>('/merge-rules');
    mode.value = data.mode;
    fields.value = data.fields;
    fixed.value = data.fixed;
    defaults.mode = data.default_mode;
    defaults.fields = data.default_fields;
    for (const key of Object.keys(values)) delete values[key];
    for (const field of data.fields) values[field.key] = field.value;
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
    await api.put('/merge-rules', { mode: mode.value, fields: { ...values } });
    ElMessage.success('入库规则已保存，下一轮采集生效');
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
