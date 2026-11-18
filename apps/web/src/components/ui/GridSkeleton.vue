<template>
  <!--
    纯海报网格骨架：列数与 VodGrid 完全一致（2/3/4/6/8），每张卡只画「海报 + 一行片名」，
    与 VodCard 当前的结构对齐；不带头部，头部由 SectionSkeleton 负责。
  -->
  <div class="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    <div v-for="index in count" :key="index" class="flex flex-col gap-2">
      <div class="aspect-[2/3] w-full animate-pulse rounded-md bg-surface-2" />
      <div class="h-5 w-3/4 animate-pulse rounded-md bg-surface-2" />
    </div>
  </div>
</template>

<script setup lang="ts">
/** 骨架卡片数量：默认 16 = 8 列 × 2 行（首页区块），列表/搜索按每页条数传 */
withDefaults(defineProps<{ count?: number }>(), { count: 16 });
</script>

<style scoped>
/* 与 VodGrid 同步：≥1400px 走 8 列（原因见 VodGrid.vue 里的注释） */
@media (min-width: 1400px) {
  .grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}
</style>
