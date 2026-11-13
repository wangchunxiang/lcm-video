<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { site } from '../site';
import Container from './layout/Container.vue';
import Sheet from './ui/Sheet.vue';

const router = useRouter();
const keyword = ref('');
const navOpen = ref(false);

const navCategories = computed(() => site.categories.slice(0, 8));

const NAV_CLASS =
  'flex-none whitespace-nowrap rounded-lg px-3 py-2 text-[15px] text-ink-2 transition hover:bg-surface-2 hover:text-ink [&.router-link-active]:bg-primary-weak [&.router-link-active]:font-semibold [&.router-link-active]:text-primary';

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
  <header class="sticky top-0 z-30 border-b border-line bg-white/94 backdrop-blur">
    <Container class="flex h-14 items-center gap-3 lg:h-16 lg:gap-5">
      <RouterLink to="/" class="flex flex-none items-center gap-2 text-logo font-bold tracking-[0.5px]">
        <img src="/img/logo.png" alt="" class="h-[30px] w-[30px] rounded-lg object-contain" />
        <span class="whitespace-nowrap">{{ site.config.siteName }}</span>
      </RouterLink>

      <nav class="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex [scrollbar-width:none]" aria-label="分类导航">
        <RouterLink to="/" :class="NAV_CLASS">首页</RouterLink>
        <RouterLink to="/list/all" :class="NAV_CLASS">全部影片</RouterLink>
        <RouterLink v-for="cat in navCategories" :key="cat.id" :to="`/list/${cat.alias}`" :class="NAV_CLASS">
          {{ cat.name }}
        </RouterLink>
      </nav>

      <form
        class="ml-auto hidden w-[232px] flex-none items-center gap-1 rounded-pill border border-line bg-surface py-1 pl-3 pr-1 transition focus-within:border-primary-line focus-within:shadow-[0_0_0_3px_var(--primary-weak)] lg:flex"
        role="search"
        @submit.prevent="submit"
      >
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索片名"
          aria-label="搜索片名"
          class="min-w-0 flex-1 border-0 bg-transparent text-small outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          class="h-7 flex-none cursor-pointer rounded-pill border-0 bg-primary px-3 text-caption text-white hover:bg-primary-strong"
        >
          搜索
        </button>
      </form>

      <div class="ml-auto flex items-center gap-1 lg:hidden">
        <RouterLink
          to="/search"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2"
          aria-label="搜索"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" stroke-linecap="round" />
          </svg>
        </RouterLink>
        <button
          type="button"
          class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2"
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
          class="cursor-pointer rounded-lg px-3 py-2.5 text-left text-body text-ink transition hover:bg-surface-2"
          @click="go('/')"
        >
          首页
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-lg px-3 py-2.5 text-left text-body text-ink transition hover:bg-surface-2"
          @click="go('/list/all')"
        >
          全部影片
        </button>
        <button
          v-for="cat in site.categories"
          :key="cat.id"
          type="button"
          class="cursor-pointer rounded-lg px-3 py-2.5 text-left text-body text-ink-2 transition hover:bg-surface-2 hover:text-primary"
          @click="go(`/list/${cat.alias}`)"
        >
          {{ cat.name }}
        </button>
      </nav>
    </Sheet>
  </header>
</template>
