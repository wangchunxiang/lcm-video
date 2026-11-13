<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { site } from '../site';
import Container from './layout/Container.vue';
import Sheet from './ui/sheet/Sheet.vue';

const router = useRouter();
const keyword = ref('');
const navOpen = ref(false);

const navCategories = computed(() => site.categories.slice(0, 8));

function submit(): void {
  const wd = keyword.value.trim();
  if (!wd) return;
  router.push({ name: 'search', query: { wd } });
}

function go(path: string): void {
  navOpen.value = false;
  router.push(path);
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
    <Container class="flex h-14 items-center gap-3 lg:h-16">
      <RouterLink class="flex min-w-0 items-center gap-2" to="/">
        <img class="h-7 w-7 rounded sm:h-8 sm:w-8" src="/img/logo.png" alt="" />
        <span class="truncate text-logo font-semibold text-ink">{{ site.config.siteName }}</span>
      </RouterLink>

      <!-- 桌面导航 -->
      <nav class="ml-2 hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="分类导航">
        <RouterLink to="/" class="rounded-md px-2.5 py-1.5 text-body text-ink-2 hover:bg-surface-2 hover:text-primary">
          首页
        </RouterLink>
        <RouterLink
          to="/list/all"
          class="rounded-md px-2.5 py-1.5 text-body text-ink-2 hover:bg-surface-2 hover:text-primary"
        >
          全部影片
        </RouterLink>
        <RouterLink
          v-for="cat in navCategories"
          :key="cat.id"
          :to="`/list/${cat.alias}`"
          class="rounded-md px-2.5 py-1.5 text-body text-ink-2 hover:bg-surface-2 hover:text-primary"
        >
          {{ cat.name }}
        </RouterLink>
      </nav>

      <!-- 桌面搜索 -->
      <form class="ml-auto hidden w-[240px] items-center gap-2 lg:flex" role="search" @submit.prevent="submit">
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索片名"
          aria-label="搜索片名"
          class="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-3 text-body text-ink outline-none placeholder:text-ink-3 focus-visible:border-primary-line focus-visible:bg-surface"
        />
        <button
          type="submit"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-strong"
          aria-label="搜索"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" stroke-linecap="round" />
          </svg>
        </button>
      </form>

      <!-- 手机：搜索 + 菜单 -->
      <div class="ml-auto flex items-center gap-1 lg:hidden">
        <RouterLink
          to="/search"
          class="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
          aria-label="搜索"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" stroke-linecap="round" />
          </svg>
        </RouterLink>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
          aria-label="分类菜单"
          @click="navOpen = true"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </Container>

    <Sheet v-model:open="navOpen" title="分类" side="left">
      <nav class="flex flex-col gap-1" aria-label="分类导航">
        <button
          type="button"
          class="rounded-md px-3 py-2.5 text-left text-body text-ink hover:bg-surface-2"
          @click="go('/')"
        >
          首页
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-2.5 text-left text-body text-ink hover:bg-surface-2"
          @click="go('/list/all')"
        >
          全部影片
        </button>
        <button
          v-for="cat in site.categories"
          :key="cat.id"
          type="button"
          class="rounded-md px-3 py-2.5 text-left text-body text-ink-2 hover:bg-surface-2 hover:text-primary"
          @click="go(`/list/${cat.alias}`)"
        >
          {{ cat.name }}
        </button>
      </nav>
    </Sheet>
  </header>
</template>
