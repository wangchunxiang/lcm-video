<script setup lang="ts">
import { buttonClass, type ButtonSize, type ButtonVariant } from './button';

const props = withDefaults(defineProps<{ variant?: ButtonVariant; size?: ButtonSize }>(), {
  variant: 'outline',
  size: 'md',
});
</script>

<template>
  <button type="button" :class="buttonClass({ variant: props.variant, size: props.size })">
    <slot />
  </button>
</template>
