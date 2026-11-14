<script setup lang="ts">
import { site } from '../site';
import Container from './layout/Container.vue';

/**
 * 页面骨架的「底部」。
 *
 * 左侧免责声明、右侧版权，两段之间用 flex 撑开；移动端自动换行。
 */
</script>

<template>
  <footer class="mt-auto border-t border-line">
    <Container>
      <div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-8 pb-16 text-caption text-ink-3">
        <p v-if="site.config.siteDisclaimer" class="leading-relaxed">
          {{ site.config.siteDisclaimer }}
        </p>
        <p class="ml-auto whitespace-nowrap">© {{ site.config.siteName }}</p>
      </div>
    </Container>
  </footer>
</template>
