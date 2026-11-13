<script setup lang="ts">
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import Button from '../components/ui/Button.vue';

useSeo(() => ({
  title: `页面不存在 - ${site.config.siteName}`,
  noindex: true,
}));
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-24 text-center">
    <p class="text-[64px] font-extrabold leading-none tracking-[4px] text-primary">404</p>
    <h1 class="text-page font-bold text-ink">页面不存在</h1>
    <p class="text-body text-ink-3">你访问的页面可能已被删除，或者链接地址有误。</p>
    <div class="mt-2 flex flex-wrap justify-center gap-2">
      <Button variant="primary" @click="$router.push('/')">回到首页</Button>
      <Button @click="$router.push('/list/all')">全部影片</Button>
    </div>
  </div>
</template>
