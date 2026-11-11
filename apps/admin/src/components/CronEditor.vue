<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isValidCron } from '@lcm/shared/cron';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

type Mode = 'manual' | 'interval' | 'hour' | 'day' | 'custom';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'manual', label: '仅手动' },
  { value: 'interval', label: '间隔' },
  { value: 'hour', label: '每小时' },
  { value: 'day', label: '每天' },
  { value: 'custom', label: '自定义' },
];

const mode = ref<Mode>('manual');
const text = ref('');
const minuteOfHour = ref(0);
const time = ref('03:00');
const intervalUnit = ref<'minute' | 'hour'>('hour');
const intervalValue = ref(6);

const minuteOptions = Array.from({ length: 60 }, (_, index) => index);
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
  return `${m} ${h} * * *`;
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
watch([mode, minuteOfHour, time, intervalUnit, intervalValue], () => {
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
function onIntervalUnitChange(unit: 'minute' | 'hour') {
  intervalUnit.value = unit;
  intervalValue.value = unit === 'minute' ? 30 : 6;
}
</script>

<template>
  <div class="cron-editor">
    <div class="row">
      <el-select v-model="mode" style="width: 110px">
        <el-option v-for="item in MODES" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>

      <template v-if="mode === 'interval'">
        <el-select v-model="intervalValue" style="width: 90px">
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
          @update:model-value="(value: string) => onIntervalUnitChange(value as 'minute' | 'hour')"
        >
          <el-option label="分钟" value="minute" />
          <el-option label="小时" value="hour" />
        </el-select>
        <span class="suffix">执行一次</span>
      </template>

      <template v-else-if="mode === 'hour'">
        <el-select v-model="minuteOfHour" style="width: 130px">
          <el-option v-for="item in minuteOptions" :key="item" :label="`第 ${item} 分`" :value="item" />
        </el-select>
        <span class="suffix">执行一次</span>
      </template>

      <template v-else-if="mode === 'day'">
        <el-time-picker v-model="time" value-format="HH:mm" format="HH:mm" style="width: 120px" />
        <span class="suffix">每天执行一次</span>
      </template>

      <span v-else-if="mode === 'manual'" class="suffix">不做定时，只在手动触发时执行</span>
      <span v-else class="suffix">在定时表达式中自行填写</span>
    </div>

    <div v-if="error" class="row message error">{{ error }}</div>

  </div>
</template>

<style scoped>
.cron-editor {
  width: 100%;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.suffix {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.message {
  margin-top: 6px;
}
.error {
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
