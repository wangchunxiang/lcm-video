<script setup lang="ts">
/**
 * 页面骨架的「内容区」宽度：全站唯一的横向边界。
 *
 * 宽度取 tokens.css 的 --container / --container-gap（1600px，两侧各 96px），
 * 手机上收到两侧各 14px。横向位置只由这里决定，区块内部不再自己加左右 padding
 * （见 docs/03-前端/样式规范.md 第三节）。
 */
</script>

<template>
  <div class="page-container">
    <slot />
  </div>
</template>

<style scoped>
.page-container {
  width: min(var(--container), calc(100% - var(--container-gap)));
  margin: 0 auto;
}

@media (max-width: 768px) {
  .page-container {
    width: calc(100% - 28px);
  }
}
</style>
