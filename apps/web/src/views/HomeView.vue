<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { portal, type HomeResult } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';
import Skeleton from '../components/ui/Skeleton.vue';

const loading = ref(true);
const error = ref('');
const data = ref<HomeResult | null>(null);

const MORE_LINKS: Record<string, string> = {
  今日更新: '/list/all?sort=time',
};

function moreLink(title: string): string {
  return MORE_LINKS[title] ?? '/list/all';
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    data.value = await portal.home();
  } catch (e) {
    error.value = (e as Error).message || '首页加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

useSeo(() => ({
  title: `${site.config.siteName} - ${site.config.siteSubtitle}`,
  description: site.config.siteSubtitle,
}));
</script>

<template>
  <div>
    <section
      class="relative mt-5 mb-4 overflow-hidden rounded-[14px] bg-[linear-gradient(115deg,#0f172a_0%,#1e3a8a_52%,#2563eb_100%)] px-5 py-7 text-white sm:px-8"
    >
      <div
        class="pointer-events-none absolute -right-20 -top-28 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22),rgba(255,255,255,0))]"
      />
      <h1 class="relative text-[24px] font-bold tracking-[1px] sm:text-[30px]">{{ site.config.siteName }}</h1>
      <p class="relative mt-3 text-emphasis text-white/75">{{ site.config.siteSubtitle }}</p>
      <div v-if="data?.categories.length" class="relative mt-4 flex flex-wrap gap-2">
        <RouterLink
          v-for="cat in data.categories"
          :key="cat.id"
          :to="`/list/${cat.alias}`"
          class="rounded-pill border border-white/28 bg-white/10 px-3 py-1 text-small text-white transition hover:bg-white/22"
        >
          {{ cat.name }}
        </RouterLink>
      </div>
    </section>

    <div
      v-if="loading"
      class="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-4 md:grid-cols-4 xl:grid-cols-6 min-[1500px]:grid-cols-8"
    >
      <div v-for="index in 8" :key="index" class="rounded-[10px] bg-surface p-1 shadow-card sm:p-2.5">
        <Skeleton class="aspect-[2/3] w-full" />
        <Skeleton class="mt-2 h-3.5 w-4/5" />
        <Skeleton class="mt-1.5 h-3 w-1/2" />
      </div>
    </div>
    <p v-else-if="error" class="my-6 rounded-[10px] border border-[#f3d1d1] bg-[#fdf3f3] px-4 py-5 text-center text-body text-danger">
      {{ error }}
    </p>

    <template v-else-if="data">
      <section v-for="row in data.rows" :key="row.title" class="mb-8">
        <div class="mb-4 flex items-baseline gap-3">
          <h2 class="text-title font-bold text-ink">{{ row.title }}</h2>
          <RouterLink class="ml-auto text-small text-ink-3 transition hover:text-primary" :to="moreLink(row.title)">
            更多 ›
          </RouterLink>
        </div>
        <VodGrid v-if="row.items.length" :items="row.items" />
        <p v-else class="py-10 text-center text-body text-ink-3">暂无内容</p>
      </section>
      <p v-if="!data.rows.length" class="py-16 text-center text-body text-ink-3">暂无内容，先去后台采集一些影片吧</p>
    </template>
  </div>
</template>
