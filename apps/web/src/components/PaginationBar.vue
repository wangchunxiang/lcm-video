<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  total: number;
  pageSize: number;
}>();

const emit = defineEmits<{ change: [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));

/** 与 v2 一致：当前页前后各 2 页，最多 5 个页码；末尾几页向前补足，窗口不会缩水。 */
const WINDOW_SIZE = 5;

const windowPages = computed<number[]>(() => {
  const count = pageCount.value;
  const size = Math.min(WINDOW_SIZE, count);
  let start = Math.max(1, props.page - 2);
  // 最后几页：向前对齐，始终保持 5 个，否则点「尾页」后页码条只剩 3 个
  if (start + size - 1 > count) start = Math.max(1, count - size + 1);
  return Array.from({ length: size }, (_, index) => start + index);
});

const BTN =
  'inline-flex h-[34px] min-w-[34px] cursor-pointer items-center justify-center rounded-md border border-line bg-surface px-2 text-small text-ink-2 transition hover:border-ink-3/50 hover:text-ink';

function go(next: number): void {
  if (next < 1 || next > pageCount.value || next === props.page) return;
  emit('change', next);
}
</script>

<template>
  <nav v-if="pageCount > 1" class="flex flex-wrap items-center justify-center gap-2 pt-4">
    <button v-if="page > 1" :class="BTN" type="button" @click="go(1)">首页</button>
    <button v-if="page > 1" :class="BTN" type="button" @click="go(page - 1)">上一页</button>

    <template v-for="item in windowPages" :key="item">
      <span
        v-if="item === page"
        class="inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-md border border-primary bg-primary px-2 text-small text-white"
      >
        {{ item }}
      </span>
      <button v-else :class="BTN" type="button" @click="go(item)">{{ item }}</button>
    </template>

    <button v-if="page < pageCount" :class="BTN" type="button" @click="go(page + 1)">下一页</button>
    <button v-if="page < pageCount" :class="BTN" type="button" @click="go(pageCount)">尾页</button>

    <span class="ml-1 text-small text-ink-3">共 {{ total }} 部影片</span>
  </nav>
</template>
