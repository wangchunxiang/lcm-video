<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8 }>(), { gap: 3 });

const GAP = { 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5', 6: 'gap-6', 8: 'gap-8' } as const;
const classes = computed(() => `flex flex-col ${GAP[props.gap]}`);
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
