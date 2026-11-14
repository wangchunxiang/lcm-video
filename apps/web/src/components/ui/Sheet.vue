<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { X } from 'lucide-vue-next';

/**
 * 抽屉：手机上从底部弹出（筛选），窄屏导航从左滑出。
 * 自己实现，不引 reka-ui —— 只需要「遮罩 + Esc + 锁滚动」这三件事。
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    side?: 'bottom' | 'left' | 'right';
  }>(),
  { description: '', side: 'bottom' },
);

const open = defineModel<boolean>('open', { default: false });

const PANEL: Record<'bottom' | 'left' | 'right', string> = {
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl',
  left: 'inset-y-0 left-0 w-[280px] max-w-[85vw]',
  right: 'inset-y-0 right-0 w-[280px] max-w-[85vw]',
};

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

watch(open, (value) => {
  document.body.style.overflow = value ? 'hidden' : '';
  if (value) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-mask">
      <div v-if="open" class="fixed inset-0 z-40 bg-slate-900/45" @click="open = false" />
    </Transition>

    <Transition :name="`sheet-${props.side}`">
      <section
        v-if="open"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        :class="['fixed z-50 flex flex-col bg-surface shadow-xl', PANEL[props.side]]"
      >
        <header class="flex items-start justify-between gap-4 border-b border-line px-4 py-4">
          <div class="min-w-0">
            <h2 class="text-title font-semibold text-ink">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-small text-ink-3">{{ description }}</p>
          </div>
          <button
            type="button"
            class="-mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            aria-label="关闭"
            @click="open = false"
          >
            <X :size="16" class="shrink-0" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="border-t border-line px-4 py-4">
          <slot name="footer" />
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-mask-enter-active,
.sheet-mask-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-mask-enter-from,
.sheet-mask-leave-to {
  opacity: 0;
}

.sheet-bottom-enter-active,
.sheet-bottom-leave-active,
.sheet-left-enter-active,
.sheet-left-leave-active,
.sheet-right-enter-active,
.sheet-right-leave-active {
  transition: transform 0.22s ease;
}

.sheet-bottom-enter-from,
.sheet-bottom-leave-to {
  transform: translateY(100%);
}

.sheet-left-enter-from,
.sheet-left-leave-to {
  transform: translateX(-100%);
}

.sheet-right-enter-from,
.sheet-right-leave-to {
  transform: translateX(100%);
}
</style>
