<script setup lang="ts">
import { site } from '../site';

const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-links">
        <RouterLink to="/">首页</RouterLink>
        <RouterLink to="/list/all">全部影片</RouterLink>
        <RouterLink to="/search">搜索</RouterLink>
      </div>
      <p class="footer-note">
        {{ site.config.siteName }} · {{ site.config.siteSubtitle }}
        <template v-if="site.config.siteDisclaimer"> · {{ site.config.siteDisclaimer }}</template>
      </p>
      <p class="footer-note">本站所有内容均收集自互联网，仅供个人学习与交流使用。</p>
      <p class="footer-note">© {{ year }} {{ site.config.siteName }}</p>
    </div>
  </footer>
</template>
