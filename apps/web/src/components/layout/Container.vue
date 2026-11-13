<script setup lang="ts">
// 只负责「最大宽度 + 左右留白」，调用方传 class 时会由 Vue 自动合并到根节点。
</script>

<template>
  <div class="mx-auto w-full max-w-[1800px] px-4 sm:px-6 xl:px-[60px]"><slot /></div>
</template>
