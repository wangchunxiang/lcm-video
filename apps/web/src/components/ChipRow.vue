<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';
import type { ChipOption } from './chip-option';

const props = withDefaults(
  defineProps<{ options: ChipOption[]; modelValue: string; class?: string }>(),
  { class: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const classes = computed(() => cn('flex flex-wrap gap-2', props.class));
</script>

<template>
  <div :class="classes">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="h-8 rounded-pill border px-3 text-small outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30"
      :class="
        modelValue === option.value
          ? 'border-primary bg-primary-weak font-medium text-primary'
          : 'border-line bg-surface text-ink-2 hover:border-primary-line hover:text-primary'
      "
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
