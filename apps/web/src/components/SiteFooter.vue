<script setup lang="ts">
import { site } from '../site';
import Container from './layout/Container.vue';

const year = new Date().getFullYear();
</script>

<template>
  <footer class="mt-8 border-t border-line bg-surface">
    <Container class="flex flex-col gap-2 py-6 text-small text-ink-3">
      <div class="flex flex-wrap gap-4">
        <RouterLink to="/" class="transition hover:text-primary">首页</RouterLink>
        <RouterLink to="/list/all" class="transition hover:text-primary">全部影片</RouterLink>
        <RouterLink to="/search" class="transition hover:text-primary">搜索</RouterLink>
      </div>
      <p class="leading-[1.8]">
        {{ site.config.siteName }} · {{ site.config.siteSubtitle }}
        <template v-if="site.config.siteDisclaimer"> · {{ site.config.siteDisclaimer }}</template>
      </p>
      <p class="leading-[1.8]">本站所有内容均收集自互联网，仅供个人学习与交流使用。</p>
      <p class="leading-[1.8]">© {{ year }} {{ site.config.siteName }}</p>
    </Container>
  </footer>
</template>
