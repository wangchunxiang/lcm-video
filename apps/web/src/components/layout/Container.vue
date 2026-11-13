<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ class?: string }>(), { class: '' });
const classes = computed(() => cn('mx-auto w-full max-w-[1800px] px-4 sm:px-6 xl:px-[60px]', props.class));
</script>

<template>
  <div :class="classes"><slot /></div>
</template>
