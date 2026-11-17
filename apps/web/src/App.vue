<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import SiteHeader from './components/SiteHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import MobileTabBar from './components/MobileTabBar.vue';
import Container from './components/layout/Container.vue';
import { ensureSite } from './site';

/**
 * 页面骨架：顶部 → 内容区 → 底部（+ 小屏底部导航）。
 *
 * 内容区默认由 Container 收边；带 `meta.fullBleed` 的页面（目前只有首页）
 * 自己管横向边界，好让大图这类区块真正通栏。
 * 小屏的 MobileTabBar 是 fixed，不占流；根节点在 <sm 补上与它等高的 pb，
 * 页脚最后一行不会被压在底栏下面。
 */
const route = useRoute();

onMounted(() => {
  void ensureSite();
});
</script>

<template>
  <div
    class="flex min-h-screen flex-col bg-bg text-ink pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0"
  >
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
    <MobileTabBar />
  </div>
</template>
