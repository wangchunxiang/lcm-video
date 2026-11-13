<script setup lang="ts">
import { computed } from 'vue';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * 变体用 cva 声明，但 props 显式写联合类型：
 * Vue 的编译器无法解析 cva 的 `VariantProps<typeof …>`（TS 条件类型），
 * 在 defineProps 里引用会导致 `Unresolvable type: TSConditionalType`。
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-body font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-strong',
        outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        link: 'text-primary hover:text-primary-strong',
      },
      size: {
        sm: 'h-8 px-3 text-small',
        md: 'h-9 px-4',
        lg: 'h-10 px-5 text-emphasis',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Variant = 'primary' | 'outline' | 'ghost' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const props = withDefaults(defineProps<{ variant?: Variant; size?: Size; class?: string }>(), {
  variant: 'primary',
  size: 'md',
  class: '',
});

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), props.class));
</script>

<template>
  <button type="button" :class="classes">
    <slot />
  </button>
</template>
