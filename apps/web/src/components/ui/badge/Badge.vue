<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{ variant?: 'solid' | 'soft' | 'outline'; class?: string }>(),
  { variant: 'soft', class: '' },
);

const classes = computed(() =>
  cn(
    'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption leading-5',
    props.variant === 'solid' && 'bg-primary text-white',
    props.variant === 'soft' && 'bg-surface-2 text-ink-2',
    props.variant === 'outline' && 'border border-line text-ink-2',
    props.class,
  ),
);
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
