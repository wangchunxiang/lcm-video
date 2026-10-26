<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { describeCron, isValidCron, nextRunAt, WEEK_LABELS } from '@lcm/shared/cron';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

type Mode = 'manual' | 'interval' | 'hour' | 'day' | 'week' | 'month' | 'custom';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'manual', label: '仅手动' },
  { value: 'interval', label: '间隔执行' },
  { value: 'hour', label: '每小时' },
  { value: 'day', label: '每天' },
  { value: 'week', label: '每周' },
  { value: 'month', label: '每月' },
  { value: 'custom', label: '自定义' },
];

const mode = ref<Mode>('manual');
const minuteOfHour = ref(0);
const time = ref('03:00');
const weekdays = ref<number[]>([1]);
const monthdays = ref<number[]>([1]);
const custom = ref('');
const intervalUnit = ref<'minute' | 'hour'>('hour');
const intervalValue = ref(6);

const minuteOptions = Array.from({ length: 60 }, (_, index) => index);
const monthdayOptions = Array.from({ length: 31 }, (_, index) => index + 1);
const intervalMinuteOptions = [1, 2, 5, 10, 15, 20, 30];
const intervalHourOptions = [1, 2, 3, 4, 6, 8, 12];

const weekdayPresets: Array<{ label: string; days: number[] }> = [
  { label: '工作日', days: [1, 2, 3, 4, 5] },
  { label: '周末', days: [6, 0] },
  { label: '每天', days: [0, 1, 2, 3, 4, 5, 6] },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function hourMinute(): [number, number] {
  const [h, m] = time.value.split(':');
  return [Number(h) || 0, Number(m) || 0];
}

const expr = computed(() => {
  if (mode.value === 'manual') return '';
  if (mode.value === 'custom') return custom.value.trim();
  if (mode.value === 'interval') {
    return intervalUnit.value === 'minute'
      ? `*/${intervalValue.value} * * * *`
      : `0 */${intervalValue.value} * * *`;
  }
  if (mode.value === 'hour') return `${minuteOfHour.value} * * * *`;

  const [h, m] = hourMinute();
  if (mode.value === 'day') return `${m} ${h} * * *`;
  if (mode.value === 'week') {
    const days = weekdays.value.length > 0 ? [...weekdays.value].sort((a, b) => a - b) : [1];
    return `${m} ${h} * * ${days.join(',')}`;
  }
  const days = monthdays.value.length > 0 ? [...monthdays.value].sort((a, b) => a - b) : [1];
  return `${m} ${h} ${days.join(',')} * *`;
});

const error = computed(() => (expr.value ? isValidCron(expr.value) : null));
const description = computed(() => (expr.value && !error.value ? describeCron(expr.value) : ''));
const monthdayWarning = computed(() =>
  mode.value === 'month' && monthdays.value.some((day) => day >= 29)
    ? '选中的 29、30、31 号在部分月份不存在，那些月份不执行'
    : '',
);

function formatDate(date: Date): string {
  const week = WEEK_LABELS.find((item) => item.value === date.getDay())?.label ?? '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${week} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRelative(date: Date, now: Date): string {
  const diff = Math.round((date.getTime() - now.getTime()) / 60000);
  if (diff < 60) return `${diff} 分钟后`;
  const hours = Math.round(diff / 60);
  if (hours < 48) return `${hours} 小时后`;
  return `${Math.round(hours / 24)} 天后`;
}

const upcoming = computed<Array<{ text: string; relative: string }>>(() => {
  if (!expr.value || error.value) return [];
  const result: Array<{ text: string; relative: string }> = [];
  const now = new Date();
  let from = now;
  for (let i = 0; i < 3; i++) {
    const next = nextRunAt(expr.value, from);
    if (!next) break;
    result.push({ text: formatDate(next), relative: formatRelative(next, now) });
    from = next;
  }
  return result;
});

function applyExpr(value: string) {
  const text = value.trim();
  if (!text) {
    mode.value = 'manual';
    return;
  }

  let matched = /^\*\/(\d+) \* \* \* \*$/.exec(text);
  if (matched) {
    mode.value = 'interval';
    intervalUnit.value = 'minute';
    intervalValue.value = Number(matched[1]);
    return;
  }

  matched = /^0 \*\/(\d+) \* \* \*$/.exec(text);
  if (matched) {
    mode.value = 'interval';
    intervalUnit.value = 'hour';
    intervalValue.value = Number(matched[1]);
    return;
  }

  matched = /^(\d+) \* \* \* \*$/.exec(text);
  if (matched) {
    mode.value = 'hour';
    minuteOfHour.value = Number(matched[1]);
    return;
  }

  matched = /^(\d+) (\d+) \* \* \*$/.exec(text);
  if (matched) {
    mode.value = 'day';
    time.value = `${pad(Number(matched[2]))}:${pad(Number(matched[1]))}`;
    return;
  }

  matched = /^(\d+) (\d+) \* \* ([\d,]+)$/.exec(text);
  if (matched) {
    mode.value = 'week';
    time.value = `${pad(Number(matched[2]))}:${pad(Number(matched[1]))}`;
    weekdays.value = matched[3]!.split(',').map(Number).map((value) => (value === 7 ? 0 : value));
    return;
  }

  matched = /^(\d+) (\d+) ([\d,]+) \* \*$/.exec(text);
  if (matched) {
    mode.value = 'month';
    time.value = `${pad(Number(matched[2]))}:${pad(Number(matched[1]))}`;
    monthdays.value = matched[3]!.split(',').map(Number);
    return;
  }

  mode.value = 'custom';
  custom.value = text;
}

let syncing = false;

watch(
  () => props.modelValue,
  (value) => {
    if (value === expr.value) return;
    syncing = true;
    applyExpr(value);
    void nextTick(() => {
      syncing = false;
    });
  },
  { immediate: true },
);

watch([mode, minuteOfHour, time, weekdays, monthdays, custom, intervalUnit, intervalValue], () => {
  if (syncing) return;
  emit('update:modelValue', expr.value);
});

function applyWeekdayPreset(days: number[]) {
  weekdays.value = [...days];
}

function onIntervalUnitChange(unit: 'minute' | 'hour') {
  intervalValue.value = unit === 'minute' ? 30 : 6;
}
</script>

<template>
  <div class="cron-editor">
    <div class="line">
      <span class="label">频率</span>
      <el-select v-model="mode" style="width: 130px">
        <el-option v-for="item in MODES" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>

      <template v-if="mode === 'interval'">
        <span class="label">每</span>
        <el-select v-model="intervalValue" style="width: 90px">
          <el-option
            v-for="item in intervalUnit === 'minute' ? intervalMinuteOptions : intervalHourOptions"
            :key="item"
            :label="String(item)"
            :value="item"
          />
        </el-select>
        <el-radio-group :model-value="intervalUnit" @change="(value) => onIntervalUnitChange(value as 'minute' | 'hour')">
          <el-radio value="minute">分钟</el-radio>
          <el-radio value="hour">小时</el-radio>
        </el-radio-group>
      </template>

      <template v-if="mode === 'hour'">
        <span class="label">每小时的</span>
        <el-select v-model="minuteOfHour" style="width: 100px">
          <el-option v-for="item in minuteOptions" :key="item" :label="`${item} 分`" :value="item" />
        </el-select>
      </template>

      <template v-if="mode === 'day'">
        <span class="label">时间</span>
        <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
      </template>

      <template v-if="mode === 'week'">
        <span class="label">星期</span>
        <el-select v-model="weekdays" multiple collapse-tags style="width: 200px" placeholder="选择星期">
          <el-option v-for="item in WEEK_LABELS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <span class="label">时间</span>
        <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
      </template>

      <template v-if="mode === 'month'">
        <span class="label">日期</span>
        <el-select v-model="monthdays" multiple collapse-tags style="width: 200px" placeholder="选择日期">
          <el-option v-for="item in monthdayOptions" :key="item" :label="`${item} 号`" :value="item" />
        </el-select>
        <span class="label">时间</span>
        <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
      </template>
    </div>

    <div v-if="mode === 'week'" class="line">
      <span class="label">常用</span>
      <el-button v-for="item in weekdayPresets" :key="item.label" size="small" @click="applyWeekdayPreset(item.days)">
        {{ item.label }}
      </el-button>
    </div>

    <div v-if="mode === 'custom'" class="line">
      <span class="label">表达式</span>
      <el-input v-model="custom" placeholder="分 时 日 月 周，如 0 3 * * *" />
    </div>

    <div class="preview">
      <template v-if="expr">
        <div class="preview-row">
          <span class="key">表达式</span>
          <code>{{ expr }}</code>
          <span v-if="description" class="desc">{{ description }}</span>
        </div>
        <div v-if="error" class="preview-row error">{{ error }}</div>
        <div v-else-if="upcoming.length > 0" class="preview-row">
          <span class="key">下次运行</span>
          <div class="times">
            <span v-for="item in upcoming" :key="item.text" class="time">
              {{ item.text }}<span class="relative">{{ item.relative }}</span>
            </span>
          </div>
        </div>
        <div v-if="monthdayWarning" class="preview-row warning">{{ monthdayWarning }}</div>
      </template>
      <div v-else class="preview-row muted">留空表示只能手动执行</div>
    </div>
  </div>
</template>

<style scoped>
.cron-editor {
  width: 100%;
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  row-gap: 8px;
}
.label {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.preview {
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  line-height: 1.9;
}
.preview-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.key {
  flex: none;
  width: 56px;
  color: var(--el-text-color-secondary);
}
code {
  padding: 0 6px;
  border-radius: 3px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  font-family: Consolas, Monaco, monospace;
}
.desc {
  color: var(--el-text-color-regular);
}
.times {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.time {
  color: var(--el-text-color-regular);
  font-family: Consolas, Monaco, monospace;
}
.relative {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  font-family: inherit;
}
.muted {
  color: var(--el-text-color-secondary);
}
.error {
  color: var(--el-color-danger);
}
.warning {
  color: var(--el-color-warning);
}
</style>
