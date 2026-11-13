<script setup lang="ts">
import type { ChipOption } from './chip-option';

defineProps<{ options: ChipOption[]; modelValue: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="[
        'h-8 cursor-pointer rounded-pill border px-3 text-small transition',
        modelValue === option.value
          ? 'border-primary-line bg-primary-weak font-semibold text-primary'
          : 'border-line bg-surface text-ink-2 hover:border-primary-line hover:text-primary',
      ]"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
