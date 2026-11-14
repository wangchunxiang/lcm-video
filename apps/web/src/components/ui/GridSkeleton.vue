<template>
  <!-- 区块加载占位：标题条 + 8 列 × 2 行海报骨架，列数与 VodGrid 一致，填充时不跳版 -->
  <div class="flex flex-col gap-4">
    <div class="flex items-baseline gap-4">
      <div class="h-6 w-24 animate-pulse rounded-md bg-surface-2" />
      <div class="h-3 w-20 animate-pulse rounded-md bg-surface-2" />
    </div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      <div v-for="index in count" :key="index" class="flex flex-col gap-2">
        <div class="aspect-[2/3] w-full animate-pulse rounded-md bg-surface-2" />
        <div class="h-4 w-3/4 animate-pulse rounded-md bg-surface-2" />
        <div class="h-3 w-1/2 animate-pulse rounded-md bg-surface-2" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 骨架块数量：默认 16 = 8 列 × 2 行 */
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
