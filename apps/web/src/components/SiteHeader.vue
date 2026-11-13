<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { site } from '../site';
import Container from './layout/Container.vue';
import Icon from './Icon.vue';
import Sheet from './ui/Sheet.vue';

const router = useRouter();
const keyword = ref('');
const navOpen = ref(false);
const scrolled = ref(false);

const navCategories = computed(() => site.categories.slice(0, 8));

/** 与 v2 主题一致：导航 18px、行高 64px、选中态用主色。 */
const NAV =
  'inline-flex h-16 flex-none items-center gap-1.5 whitespace-nowrap px-4 text-nav text-ink-2 transition hover:text-primary [&.router-link-active]:text-primary';

const ICONS: Record<string, string> = { dianying: 'film', juji: 'tv', zongyi: 'clapper', dongman: 'anime' };

function iconOf(name: string, alias: string): string {
  const mapped = ICONS[alias];
  if (mapped) return mapped;
  if (name.includes('电影')) return 'film';
  if (name.includes('动漫')) return 'anime';
  if (name.includes('综艺')) return 'clapper';
  if (name.includes('剧')) return 'tv';
  return '';
}

function onScroll(): void {
  scrolled.value = window.scrollY > 8;
}

onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));

function submit(): void {
  const wd = keyword.value.trim();
  if (!wd) return;
  void router.push({ name: 'search', query: { wd } });
}

function go(path: string): void {
  navOpen.value = false;
  void router.push(path);
}
</script>

<template>
  <header
    class="sticky top-0 z-50 transition-colors duration-200"
    :class="scrolled ? 'bg-bg' : 'bg-transparent'"
  >
    <Container>
      <div class="flex h-16 items-center gap-6">
        <RouterLink
          to="/"
          class="flex flex-none items-center gap-2 text-logo font-bold leading-[64px] text-primary"
        >
          <img src="/img/logo.png" alt="" width="26" height="26" class="h-[26px] w-[26px] rounded-md" />
          <span class="whitespace-nowrap">{{ site.config.siteName }}</span>
        </RouterLink>

        <nav class="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="分类导航">
          <RouterLink to="/" :class="NAV">
            <Icon name="home" />
            <span>首页</span>
          </RouterLink>
          <RouterLink v-for="cat in navCategories" :key="cat.id" :to="`/list/${cat.alias}`" :class="NAV">
            <Icon v-if="iconOf(cat.name, cat.alias)" :name="iconOf(cat.name, cat.alias)" />
            <span>{{ cat.name }}</span>
          </RouterLink>
        </nav>

        <form
          class="ml-auto hidden h-[34px] w-[380px] flex-none items-center overflow-hidden rounded-md bg-search lg:flex"
          role="search"
          @submit.prevent="submit"
        >
          <input
            v-model="keyword"
            type="search"
            name="wd"
            maxlength="50"
            placeholder="搜索影片"
            aria-label="搜索影片"
            class="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-small text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            class="h-full cursor-pointer border-0 bg-transparent px-3 text-small text-ink-2 transition hover:text-primary"
          >
            搜索
          </button>
        </form>

        <div class="ml-auto flex items-center gap-1 lg:hidden">
          <RouterLink
            to="/search"
            class="flex h-9 w-9 items-center justify-center text-ink-2 transition hover:text-primary"
            aria-label="搜索"
          >
            <Icon name="search" :size="20" />
          </RouterLink>
          <button
            type="button"
            class="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-2 transition hover:text-primary"
            aria-label="分类菜单"
            @click="navOpen = true"
          >
            <Icon name="menu" :size="20" />
          </button>
        </div>
      </div>
    </Container>

    <Sheet v-model:open="navOpen" title="分类" side="left">
      <nav class="flex flex-col gap-1" aria-label="分类导航">
        <button
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-left text-body text-ink transition hover:bg-surface-2"
          @click="go('/')"
        >
          <Icon name="home" :size="16" />
          首页
        </button>
        <button
          v-for="cat in site.categories"
          :key="cat.id"
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-left text-body text-ink-2 transition hover:bg-surface-2 hover:text-primary"
          @click="go(`/list/${cat.alias}`)"
        >
          <Icon v-if="iconOf(cat.name, cat.alias)" :name="iconOf(cat.name, cat.alias)" :size="16" />
          {{ cat.name }}
        </button>
      </nav>
    </Sheet>
  </header>
</template>
