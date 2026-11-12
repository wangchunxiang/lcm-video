<script setup lang="ts">
import { onMounted } from 'vue';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import { loadSite } from './site';

onMounted(() => {
  void loadSite();
});
</script>

<template>
  <div class="site">
    <SiteHeader />
    <main class="site-main">
      <div class="container">
        <RouterView />
      </div>
    </main>
    <SiteFooter />
  </div>
</template>
