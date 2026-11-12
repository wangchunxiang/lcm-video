<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { portal, type HomeResult } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodGrid from '../components/VodGrid.vue';

const loading = ref(true);
const error = ref('');
const data = ref<HomeResult | null>(null);

const MORE_LINKS: Record<string, string> = {
  今日更新: '/list/all?sort=time',
  最新收录: '/list/all?sort=new',
  最近热播: '/list/all',
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
    <section class="hero">
      <h1 class="hero-title">{{ site.config.siteName }}</h1>
      <p class="hero-sub">{{ site.config.siteSubtitle }}</p>
      <div v-if="data?.categories.length" class="hero-chips">
        <RouterLink
          v-for="cat in data.categories"
          :key="cat.id"
          class="hero-chip"
          :to="`/list/${cat.alias}`"
        >
          {{ cat.name }}
        </RouterLink>
      </div>
    </section>

    <p v-if="loading" class="loading-tip">加载中…</p>
    <p v-else-if="error" class="error-box">{{ error }}</p>

    <template v-else-if="data">
      <section v-for="row in data.rows" :key="row.title" class="section">
        <div class="section-head">
          <h2 class="section-title">{{ row.title }}</h2>
          <RouterLink class="section-more" :to="moreLink(row.title)">更多 ›</RouterLink>
        </div>
        <VodGrid v-if="row.items.length" :items="row.items" />
        <p v-else class="empty-tip">暂无内容</p>
      </section>
      <p v-if="!data.rows.length" class="empty-tip">暂无内容，先去后台采集一些影片吧</p>
    </template>
  </div>
</template>
