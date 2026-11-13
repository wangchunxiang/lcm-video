<script setup lang="ts">
import { site } from '../site';
import Container from './layout/Container.vue';
</script>

<template>
  <footer class="mt-auto border-t border-line bg-bg pt-3 pb-4">
    <Container>
      <p v-if="site.config.siteDisclaimer" class="text-caption leading-[1.6] text-ink-3">
        {{ site.config.siteDisclaimer }}
      </p>
      <p class="mt-1 text-caption text-ink-3">© {{ site.config.siteName }}</p>
    </Container>
  </footer>
</template>
