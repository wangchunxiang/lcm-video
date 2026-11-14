<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import Container from './components/layout/Container.vue';
import { loadSite } from './site';

/**
 * 页面骨架：顶部 → 内容区 → 底部。
 *
 * 内容区默认由 Container 收边；带 `meta.fullBleed` 的页面（目前只有首页）
 * 自己管横向边界，好让 hero / 大图这类区块真正通栏。
 */
const route = useRoute();

onMounted(() => {
  void loadSite();
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg text-ink">
    <SiteHeader />
    <!-- 顶栏 sticky 在流里占位，内容自然从它下方开始；fullBleed 页面自己管横向边界 -->
    <main class="flex-1 pb-4">
      <RouterView v-slot="{ Component }">
        <Container v-if="!route.meta.fullBleed">
          <component :is="Component" />
        </Container>
        <component :is="Component" v-else />
      </RouterView>
    </main>
    <SiteFooter />
  </div>
</template>
