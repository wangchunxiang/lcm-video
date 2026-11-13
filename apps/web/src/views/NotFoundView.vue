<script setup lang="ts">
import { site } from '../site';
import { useSeo } from '../composables/useSeo';

useSeo(() => ({
  title: `页面不存在 - ${site.config.siteName}`,
  noindex: true,
}));
</script>

<template>
  <section class="flex min-h-[60vh] flex-col items-center justify-center pb-8 text-center">
    <h1 class="mb-2 text-display leading-none font-extrabold text-primary">404</h1>
    <p class="mb-5 text-emphasis text-ink-2">页面不存在或已被移除</p>

    <div class="flex flex-wrap justify-center gap-3">
      <RouterLink
        to="/"
        class="inline-flex h-[38px] items-center rounded-md bg-primary px-6 text-body text-white transition hover:bg-primary-strong"
      >
        回到首页
      </RouterLink>
      <button
        type="button"
        class="inline-flex h-[38px] cursor-pointer items-center rounded-md border border-line bg-surface-2 px-5 text-body text-ink-2 transition hover:border-primary-line hover:text-primary"
        @click="$router.back()"
      >
        返回上一页
      </button>
    </div>

    <div v-if="site.categories.length" class="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-small">
      <span class="text-ink-3">去看看</span>
      <RouterLink
        v-for="cat in site.categories"
        :key="cat.id"
        :to="`/list/${cat.alias}`"
        class="text-ink-2 transition hover:text-primary"
      >
        {{ cat.name }}
      </RouterLink>
    </div>
  </section>
</template>
