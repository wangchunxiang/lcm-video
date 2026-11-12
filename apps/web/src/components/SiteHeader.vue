<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { site } from '../site';

const router = useRouter();
const keyword = ref('');

const navCategories = computed(() => site.categories.slice(0, 8));

function submit(): void {
  const wd = keyword.value.trim();
  if (!wd) return;
  router.push({ name: 'search', query: { wd } });
}
</script>

<template>
  <header class="site-header">
    <div class="container header-inner">
      <RouterLink class="brand" to="/">
        <img class="brand-logo" src="/img/logo.png" alt="" />
        <span class="brand-text">{{ site.config.siteName }}</span>
      </RouterLink>

      <nav class="site-nav" aria-label="分类导航">
        <RouterLink to="/" class="nav-link" exact-active-class="router-link-active">首页</RouterLink>
        <RouterLink to="/list/all" class="nav-link">全部影片</RouterLink>
        <RouterLink v-for="cat in navCategories" :key="cat.id" :to="`/list/${cat.alias}`" class="nav-link">
          {{ cat.name }}
        </RouterLink>
      </nav>

      <form class="header-search" role="search" @submit.prevent="submit">
        <input v-model="keyword" type="search" placeholder="搜索片名" aria-label="搜索片名" />
        <button type="submit">搜索</button>
      </form>
    </div>
  </header>
</template>
