<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ modelValue?: string; class?: string }>(), {
  modelValue: '',
  class: '',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const classes = computed(() =>
  cn(
    'h-9 w-full rounded-md border border-line bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-3 focus-visible:border-primary-line focus-visible:ring-2 focus-visible:ring-primary/20',
    props.class,
  ),
);
</script>

<template>
  <input
    :class="classes"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
