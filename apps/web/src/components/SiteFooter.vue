<script setup lang="ts">
import { site } from '../site';
import Container from './layout/Container.vue';

/**
 * 页面骨架的「底部」。
 *
 * 左侧免责声明、右侧版权，两段之间用 flex 撑开；移动端自动换行。
 * 桌面端高度与页头对齐（都取 --header-h，再加 1px 上边框），
 * 窄屏放不下时退化成自适应高度，靠 py-3 给上下留白。
 */
</script>

<template>
  <footer class="mt-auto border-t border-line">
    <Container>
      <div
        class="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 py-3 text-caption text-ink-3 md:h-[var(--header-h)] md:py-0"
      >
        <p v-if="site.config.siteDisclaimer" class="leading-relaxed">
          {{ site.config.siteDisclaimer }}
        </p>
        <p class="ml-auto whitespace-nowrap">© {{ site.config.siteName }}</p>
      </div>
    </Container>
  </footer>
</template>
