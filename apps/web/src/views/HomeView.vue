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
  <div class="pt-4">
    <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      <div v-for="index in 8" :key="index" class="flex flex-col gap-2">
        <Skeleton class="aspect-[210/280] w-full rounded-md" />
        <Skeleton class="mx-auto h-4 w-4/5" />
      </div>
    </div>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <template v-else-if="data">
      <section v-for="row in data.rows" :key="row.title" class="mb-6">
        <div class="mb-4 flex items-baseline">
          <RouterLink :to="row.more || '/list/all'" class="group inline-flex items-baseline">
            <h2 class="text-section font-bold text-ink transition-colors group-hover:text-primary">
              {{ row.title }}
            </h2>
            <span
              class="max-w-0 overflow-hidden whitespace-nowrap text-nav text-ink-3 opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[5em] group-hover:opacity-100"
            >
              查看更多
            </span>
            <span class="ml-1 text-nav text-ink-3 transition-colors group-hover:text-primary">&gt;</span>
          </RouterLink>
        </div>
        <VodGrid v-if="row.items.length" :items="row.items" />
        <p v-else class="py-10 text-center text-body text-ink-3">暂无影片，稍后再来看看。</p>
      </section>

      <p v-if="!data.rows.length" class="py-16 text-center text-body text-ink-3">
        暂无影片，先去后台采集一些吧。
      </p>
    </template>
  </div>
</template>
