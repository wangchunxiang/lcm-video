<template>
  <!--
    首页区块骨架：标题条 + 副标题条 + 海报网格。
    结构与 VodSection 一一对应（标题行 mb-4、网格列数/行数相同），加载完不会跳高度。
    标题行固定 35px，与 h2（22px × 1.6 行高）的占位一致。
  -->
  <section class="flex flex-col gap-4">
    <div class="flex h-[35px] items-center gap-4">
      <div class="h-6 w-24 animate-pulse rounded-md bg-surface-2" />
      <div class="h-3 w-20 animate-pulse rounded-md bg-surface-2" />
    </div>
    <GridSkeleton :count="count" />
  </section>
</template>

<script setup lang="ts">
import GridSkeleton from './GridSkeleton.vue';

/** 默认 16 = 8 列 × 2 行，与 VodSection 的 limit 一致 */
withDefaults(defineProps<{ count?: number }>(), { count: 16 });
</script>
