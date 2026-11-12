<script setup lang="ts">
import { site } from '../site';
import { useSeo } from '../composables/useSeo';

useSeo(() => ({
  title: `页面不存在 - ${site.config.siteName}`,
  noindex: true,
}));
</script>

<template>
  <div class="not-found">
    <div class="big-code">404</div>
    <h1 class="page-title">页面不存在</h1>
    <p class="page-sub">你访问的页面可能已被删除，或者链接地址有误。</p>
    <div class="detail-actions">
      <RouterLink class="btn btn-primary" to="/">回到首页</RouterLink>
      <RouterLink class="btn" to="/list/all">全部影片</RouterLink>
    </div>
  </div>
</template>
