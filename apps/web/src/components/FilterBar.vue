<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  types: { id: string; name: string; alias: string }[];
  years: number[];
  type: string;
  year: string;
  sort: string;
}>();

const emit = defineEmits<{
  'update:type': [value: string];
  'update:year': [value: string];
  'update:sort': [value: string];
}>();

interface Option {
  value: string;
  label: string;
}

const typeOptions = computed<Option[]>(() => [
  { value: '', label: '全部' },
  ...props.types.map((item) => ({ value: item.alias, label: item.name })),
]);
const yearOptions = computed<Option[]>(() => [
  { value: '', label: '全部' },
  ...props.years.map((item) => ({ value: String(item), label: String(item) })),
]);
const sortOptions: Option[] = [
  { value: 'time', label: '最近更新' },
  { value: 'new', label: '最新入库' },
];

const ITEM =
  'cursor-pointer rounded-md px-3 py-1 text-vod leading-6 transition';
const ACTIVE = 'bg-primary text-white';
const IDLE = 'text-ink-2 hover:text-primary';
</script>

<template>
  <div class="mb-4 flex flex-col gap-2">
    <div v-if="types.length" class="flex flex-wrap items-center gap-1">
      <span class="w-10 flex-none text-vod text-ink-3">类型</span>
      <button
        v-for="option in typeOptions"
        :key="`type-${option.value}`"
        type="button"
        :class="[ITEM, option.value === type ? ACTIVE : IDLE]"
        @click="emit('update:type', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="years.length" class="flex flex-wrap items-center gap-1">
      <span class="w-10 flex-none text-vod text-ink-3">年份</span>
      <button
        v-for="option in yearOptions"
        :key="`year-${option.value}`"
        type="button"
        :class="[ITEM, option.value === year ? ACTIVE : IDLE]"
        @click="emit('update:year', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-1">
      <span class="w-10 flex-none text-vod text-ink-3">排序</span>
      <button
        v-for="option in sortOptions"
        :key="`sort-${option.value}`"
        type="button"
        :class="[ITEM, option.value === sort ? ACTIVE : IDLE]"
        @click="emit('update:sort', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
