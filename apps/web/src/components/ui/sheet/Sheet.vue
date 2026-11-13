<script setup lang="ts">
import { computed } from 'vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { cn } from '@/lib/utils';

/**
 * 抽屉：手机上从底部弹出（筛选、导航），桌面上可从左/右滑出。
 * 行为（焦点锁定、Esc 关闭、滚动锁）由 reka-ui 提供，样式只用 Tailwind。
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    side?: 'bottom' | 'left' | 'right';
    class?: string;
  }>(),
  { description: '', side: 'bottom', class: '' },
);

const open = defineModel<boolean>('open', { default: false });

const SIDE_CLASS = {
  bottom:
    'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-surface shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
  left:
    'fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
  right:
    'fixed inset-y-0 right-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
} as const;

const contentClass = computed(() => cn(SIDE_CLASS[props.side], props.class));
</script>

<template>
  <DialogRoot :open="open" @update:open="open = $event">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-slate-900/45 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      />
      <DialogContent :class="contentClass">
        <header class="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div class="min-w-0">
            <DialogTitle class="text-title font-semibold text-ink">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-0.5 text-small text-ink-3">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose
            class="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-surface-2 hover:text-ink"
            aria-label="关闭"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
            </svg>
          </DialogClose>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="border-t border-line px-4 py-3">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
