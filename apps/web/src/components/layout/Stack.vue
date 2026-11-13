<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8; class?: string }>(), {
  gap: 3,
  class: '',
});

const GAP = { 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5', 6: 'gap-6', 8: 'gap-8' } as const;
const classes = computed(() => cn('flex flex-col', GAP[props.gap], props.class));
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
