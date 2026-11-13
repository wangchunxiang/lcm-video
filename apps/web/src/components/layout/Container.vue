<script setup lang="ts">
// 只负责「最大宽度 + 左右留白」，与 v2 主题的 .container 一致：
// 1792px 上限，两侧各 64px；窄屏收到 16px。
</script>

<template>
  <div class="mx-auto w-[min(1792px,calc(100%-128px))] max-md:w-[calc(100%-32px)]">
    <slot />
  </div>
</template>
