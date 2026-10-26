<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isValidCron, WEEK_LABELS } from '@lcm/shared/cron';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

type Mode = 'manual' | 'interval' | 'hour' | 'day' | 'week' | 'month' | 'custom';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'manual', label: '仅手动' },
  { value: 'interval', label: '间隔' },
  { value: 'hour', label: '每小时' },
  { value: 'day', label: '每天' },
  { value: 'week', label: '每周' },
  { value: 'month', label: '每月' },
  { value: 'custom', label: '自定义' },
];

const mode = ref<Mode>('manual');
const text = ref('');
const minuteOfHour = ref(0);
const time = ref('03:00');
const weekdays = ref<number[]>([1]);
const monthdays = ref<number[]>([1]);
const intervalUnit = ref<'minute' | 'hour'>('hour');
const intervalValue = ref(6);

const minuteOptions = Array.from({ length: 60 }, (_, index) => index);
const monthdayOptions = Array.from({ length: 31 }, (_, index) => index + 1);
const intervalMinuteOptions = [1, 2, 5, 10, 15, 20, 30];
const intervalHourOptions = [1, 2, 3, 4, 6, 8, 12];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function hourMinute(): [number, number] {
  const [h, m] = time.value.split(':');
  return [Number(h) || 0, Number(m) || 0];
}

/** 由当前模式与参数生成表达式 */
function generate(): string {
  if (mode.value === 'manual') return '';
  if (mode.value === 'custom') return text.value.trim();
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
}

/** 由表达式反推模式与参数；认不出的落到自定义 */
function applyExpr(value: string) {
  const expr = value.trim();
  if (!expr) {
    mode.value = 'manual';
    return;
  }

  let matched = /^\*\/(\d+) \* \* \* \*$/.exec(expr);
  if (matched) {
    mode.value = 'interval';
    intervalUnit.value = 'minute';
    intervalValue.value = Number(matched[1]);
    return;
  }

  matched = /^0 \*\/(\d+) \* \* \*$/.exec(expr);
  if (matched) {
    mode.value = 'interval';
    intervalUnit.value = 'hour';
    intervalValue.value = Number(matched[1]);
    return;
  }

  matched = /^(\d+) \* \* \* \*$/.exec(expr);
  if (matched) {
    mode.value = 'hour';
    minuteOfHour.value = Number(matched[1]);
    return;
  }

  matched = /^(\d+) (\d+) \* \* \*$/.exec(expr);
  if (matched) {
    mode.value = 'day';
    time.value = `${pad(Number(matched[2]))}:${pad(Number(matched[1]))}`;
    return;
  }

  matched = /^(\d+) (\d+) \* \* ([\d,]+)$/.exec(expr);
  if (matched) {
    mode.value = 'week';
    time.value = `${pad(Number(matched[2]))}:${pad(Number(matched[1]))}`;
    weekdays.value = matched[3]!.split(',').map(Number).map((item) => (item === 7 ? 0 : item));
    return;
  }

  matched = /^(\d+) (\d+) ([\d,]+) \* \*$/.exec(expr);
  if (matched) {
    mode.value = 'month';
    time.value = `${pad(Number(matched[2]))}:${pad(Number(matched[1]))}`;
    monthdays.value = matched[3]!.split(',').map(Number);
    return;
  }

  mode.value = 'custom';
}

watch(
  () => props.modelValue,
  (value) => {
    if (value === text.value) return;
    text.value = value;
    if (value.trim() !== generate()) applyExpr(value);
  },
  { immediate: true },
);

// 参数变化 → 重写输入框
watch([mode, minuteOfHour, time, weekdays, monthdays, intervalUnit, intervalValue], () => {
  if (mode.value === 'custom') return;
  const next = generate();
  if (next === text.value) return;
  text.value = next;
  emit('update:modelValue', next);
});

// 输入框变化 → 反推参数
watch(text, (value) => {
  if (value.trim() !== generate()) applyExpr(value);
  emit('update:modelValue', value.trim());
});

const error = computed(() => (text.value.trim() ? isValidCron(text.value.trim()) : null));
const monthdayWarning = computed(() =>
  mode.value === 'month' && monthdays.value.some((day) => day >= 29)
    ? '29、30、31 号在部分月份不存在，那些月份不执行'
    : '',
);

function onIntervalUnitChange(unit: 'minute' | 'hour') {
  intervalUnit.value = unit;
  intervalValue.value = unit === 'minute' ? 30 : 6;
}
</script>

<template>
  <div class="cron-editor">
    <div class="modes">
      <el-radio-group v-model="mode">
        <el-radio-button v-for="item in MODES" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="mode === 'interval'" class="row">
      <span class="label">间隔</span>
      <el-select v-model="intervalValue" style="width: 110px">
        <el-option
          v-for="item in intervalUnit === 'minute' ? intervalMinuteOptions : intervalHourOptions"
          :key="item"
          :label="String(item)"
          :value="item"
        />
      </el-select>
      <el-select
        :model-value="intervalUnit"
        style="width: 90px"
        @update:model-value="(value) => onIntervalUnitChange(value as 'minute' | 'hour')"
      >
        <el-option label="分钟" value="minute" />
        <el-option label="小时" value="hour" />
      </el-select>
      <span class="suffix">执行一次</span>
    </div>

    <div v-if="mode === 'hour'" class="row">
      <span class="label">每小时</span>
      <el-select v-model="minuteOfHour" style="width: 110px">
        <el-option v-for="item in minuteOptions" :key="item" :label="`第 ${item} 分`" :value="item" />
      </el-select>
      <span class="suffix">执行一次</span>
    </div>

    <div v-if="mode === 'day'" class="row">
      <span class="label">时间</span>
      <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
      <span class="suffix">每天执行一次</span>
    </div>

    <template v-if="mode === 'week'">
      <div class="row">
        <span class="label">星期</span>
        <el-select v-model="weekdays" multiple collapse-tags style="width: 220px" placeholder="选择星期">
          <el-option v-for="item in WEEK_LABELS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
      <div class="row">
        <span class="label">时间</span>
        <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
        <span class="suffix">这些星期的这个时间执行</span>
      </div>
    </template>

    <template v-if="mode === 'month'">
      <div class="row">
        <span class="label">日期</span>
        <el-select v-model="monthdays" multiple collapse-tags style="width: 220px" placeholder="选择日期">
          <el-option v-for="item in monthdayOptions" :key="item" :label="`${item} 号`" :value="item" />
        </el-select>
      </div>
      <div class="row">
        <span class="label">时间</span>
        <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
        <span class="suffix">这些日期的这个时间执行</span>
      </div>
    </template>

    <div v-if="error" class="row message error">{{ error }}</div>
    <div v-else-if="monthdayWarning" class="row message warning">{{ monthdayWarning }}</div>

  </div>
</template>

<style scoped>
.cron-editor {
  width: 100%;
}
.modes {
  display: flex;
  flex-wrap: nowrap;
  margin-bottom: 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.label {
  flex: none;
  width: 56px;
  text-align: right;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.suffix {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.message {
  padding-left: 64px;
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
}
.warning {
  color: var(--el-color-warning);
  font-size: 12px;
}
</style>
