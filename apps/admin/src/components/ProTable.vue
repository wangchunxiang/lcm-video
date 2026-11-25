<script setup lang="ts">
/**
 * 列表页的表格壳子：撑满卡片高度 + 加载态 + 底部翻页。
 *
 * 之前每个列表页都自己写一份 `<el-table>` + `ResizeObserver` + `<el-pagination>`，
 * 十份几乎一样。这里把「高度自适应」和「翻页控件」收进组件，各页只留下列定义。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface Props {
  /** 当前页数据 */
  data: readonly unknown[];
  /** 总条数，只在显示翻页时才需要：`show-pager="false"` 的页面一次取全量，不用传 */
  total?: number;
  page?: number;
  pageSize?: number;
  loading?: boolean;
  emptyText?: string;
  pageSizes?: number[];
  /** 是否显示底部翻页（树形表等一次取全量的页面可以关掉） */
  showPager?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  emptyText: '暂无数据',
  pageSizes: () => [20, 50, 100],
  showPager: true,
});

const emit = defineEmits<{
  'update:page': [page: number];
  'update:pageSize': [size: number];
  'selection-change': [rows: unknown[]];
}>();

const wrapRef = ref<HTMLElement | null>(null);
const tableHeight = ref(400);
let observer: ResizeObserver | null = null;

/** 让表格跟着卡片高度走，不出现「表格比容器高、外层再滚一次」 */
onMounted(() => {
  const el = wrapRef.value;
  if (el === null) return;
  observer = new ResizeObserver(() => {
    tableHeight.value = el.clientHeight || 400;
  });
  observer.observe(el);
  tableHeight.value = el.clientHeight || 400;
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const tableRef = ref<{ clearSelection: () => void } | null>(null);

function onPageChange(value: number): void {
  emit('update:page', value);
}

function onSizeChange(value: number): void {
  emit('update:pageSize', value);
}

defineExpose({
  clearSelection: (): void => tableRef.value?.clearSelection(),
});
</script>

<template>
  <div ref="wrapRef" class="table-wrap">
    <el-table
      ref="tableRef"
      v-loading="props.loading"
      :data="props.data"
      :height="tableHeight"
      :empty-text="props.emptyText"
      v-bind="$attrs"
      @selection-change="(rows: unknown[]) => emit('selection-change', rows)"
    >
      <slot />
    </el-table>
  </div>

  <el-pagination
    v-if="props.showPager"
    class="pager"
    layout="total, sizes, prev, pager, next"
    :total="props.total"
    :page-sizes="props.pageSizes"
    :page-size="props.pageSize"
    :current-page="props.page"
    @current-change="onPageChange"
    @size-change="onSizeChange"
  />
</template>

<style scoped>
/* 表格占满卡片剩余高度，翻页固定在底部 */
.table-wrap {
  flex: 1;
  min-height: 0;
}

.pager {
  flex: none;
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
