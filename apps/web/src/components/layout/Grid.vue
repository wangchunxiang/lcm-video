<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ class?: string }>(), { class: '' });
const classes = computed(() =>
  cn(
    'grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 sm:gap-x-3 lg:grid-cols-6 lg:gap-x-4 xl:grid-cols-8',
    props.class,
  ),
);
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
