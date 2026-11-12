<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  total: number;
  pageSize: number;
}>();

const emit = defineEmits<{ change: [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));

/** 首尾 + 当前页附近，中间用省略号。 */
const pages = computed<Array<number | '...'>>(() => {
  const count = pageCount.value;
  const current = props.page;
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

  const anchors = [...new Set([1, count, current - 1, current, current + 1])]
    .filter((p) => p >= 1 && p <= count)
    .sort((a, b) => a - b);

  const result: Array<number | '...'> = [];
  anchors.forEach((p, i) => {
    if (i > 0 && p - (anchors[i - 1] as number) > 1) result.push('...');
    result.push(p);
  });
  return result;
});

function go(page: number): void {
  if (page < 1 || page > pageCount.value || page === props.page) return;
  emit('change', page);
}
</script>

<template>
  <nav v-if="pageCount > 1" class="pager" aria-label="分页">
    <button class="pager-btn" type="button" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
    <template v-for="(item, index) in pages" :key="`${item}-${index}`">
      <span v-if="item === '...'" class="pager-info">…</span>
      <button
        v-else
        class="pager-btn"
        :class="{ 'is-on': item === page }"
        type="button"
        @click="go(item as number)"
      >
        {{ item }}
      </button>
    </template>
    <button class="pager-btn" type="button" :disabled="page >= pageCount" @click="go(page + 1)">下一页</button>
    <span class="pager-info">共 {{ total }} 条 / {{ pageCount }} 页</span>
  </nav>
</template>
