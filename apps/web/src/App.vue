<script setup lang="ts">
import { onMounted } from 'vue';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import Container from './components/layout/Container.vue';
import { loadSite } from './site';

onMounted(() => {
  void loadSite();
});
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SiteHeader />
    <main class="flex-1 pt-2">
      <Container>
        <RouterView />
      </Container>
    </main>
    <SiteFooter />
  </div>
</template>
