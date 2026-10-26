<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { describeCron, isValidCron, nextRunAt, WEEK_LABELS } from '@lcm/shared/cron';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

type Mode = 'manual' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'custom';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'manual', label: '仅手动' },
  { value: 'minute', label: '每分钟' },
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

const minuteOptions = Array.from({ length: 60 }, (_, index) => index);
const monthdayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

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
  if (mode.value === 'minute') return '* * * * *';
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

function formatDate(date: Date): string {
  const week = WEEK_LABELS.find((item) => item.value === date.getDay())?.label ?? '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${week}`;
}

const upcoming = computed<string[]>(() => {
  if (!expr.value || error.value) return [];
  const result: string[] = [];
  let from = new Date();
  for (let i = 0; i < 3; i++) {
    const next = nextRunAt(expr.value, from);
    if (!next) break;
    result.push(formatDate(next));
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
  if (text === '* * * * *') {
    mode.value = 'minute';
    return;
  }

  let matched = /^(\d+) \* \* \* \*$/.exec(text);
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

watch([mode, minuteOfHour, time, weekdays, monthdays, custom], () => {
  if (syncing) return;
  emit('update:modelValue', expr.value);
});

watch(
  () => props.modelValue,
  (value) => {
    if (mode.value === 'custom' && value !== custom.value) custom.value = value.trim();
  },
);
</script>

<template>
  <div class="cron-editor">
    <el-radio-group v-model="mode" class="modes">
      <el-radio-button v-for="item in MODES" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
    </el-radio-group>

    <div v-if="mode === 'hour'" class="line">
      <span class="label">每小时第</span>
      <el-select v-model="minuteOfHour" style="width: 100px">
        <el-option v-for="item in minuteOptions" :key="item" :label="`${item} 分`" :value="item" />
      </el-select>
      <span class="label">分钟执行</span>
    </div>

    <div v-if="mode === 'day' || mode === 'week' || mode === 'month'" class="line">
      <template v-if="mode === 'week'">
        <span class="label">星期</span>
        <el-select v-model="weekdays" multiple collapse-tags style="width: 220px" placeholder="选择星期">
          <el-option v-for="item in WEEK_LABELS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </template>
      <template v-if="mode === 'month'">
        <span class="label">日期</span>
        <el-select v-model="monthdays" multiple collapse-tags style="width: 220px" placeholder="选择日期">
          <el-option v-for="item in monthdayOptions" :key="item" :label="`${item} 号`" :value="item" />
        </el-select>
      </template>
      <span class="label">时间</span>
      <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
    </div>

    <div v-if="mode === 'custom'" class="line">
      <el-input v-model="custom" placeholder="分 时 日 月 周，如 0 3 * * *" />
    </div>

    <div class="result">
      <template v-if="expr">
        <code>{{ expr }}</code>
        <span v-if="description" class="desc">{{ description }}</span>
      </template>
      <span v-else class="muted">留空表示只能手动执行</span>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="upcoming.length > 0" class="upcoming">
      <div class="upcoming-title">下次运行</div>
      <div v-for="item in upcoming" :key="item" class="upcoming-item">{{ item }}</div>
    </div>
  </div>
</template>

<style scoped>
.cron-editor {
  width: 100%;
}
.modes {
  margin-bottom: 10px;
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.label {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.8;
}
code {
  padding: 0 6px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  font-family: Consolas, Monaco, monospace;
}
.desc {
  color: var(--el-text-color-regular);
}
.muted {
  color: var(--el-text-color-secondary);
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.8;
}
.upcoming {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.8;
}
.upcoming-title {
  color: var(--el-text-color-secondary);
}
.upcoming-item {
  color: var(--el-text-color-regular);
  font-family: Consolas, Monaco, monospace;
}
</style>
