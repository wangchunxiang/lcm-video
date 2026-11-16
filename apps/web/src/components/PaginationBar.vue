<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  total: number;
  pageSize: number;
}>();

const emit = defineEmits<{ change: [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));

/** 与 v2 一致：当前页前后各 2 页，最多 5 个页码。 */
const windowPages = computed<number[]>(() => {
  const start = Math.max(1, props.page - 2);
  const end = Math.min(pageCount.value, start + 4);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
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
