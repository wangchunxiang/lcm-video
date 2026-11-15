<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { Clapperboard, Film, House, Menu, Search, Sparkles, Tv } from 'lucide-vue-next';
import { site } from '../site';
import Container from './layout/Container.vue';
import Sheet from './ui/Sheet.vue';

/**
 * 页面骨架的「顶部」。
 *
 * 三段结构固定：品牌 → 一级分类导航 → 搜索（手机端收成图标 + 抽屉）。
 * 高度取 --header-h；底色恒定半透明 + 模糊，首页 hero 从它下方开始。
 */
const router = useRouter();
const keyword = ref('');
const navOpen = ref(false);

/** 顶部导航只放一级分类（与首页的区块一一对应），子分类留给列表页筛选 */
const navCategories = computed(() => site.categories.slice(0, 6));

/** 导航就是一行文字：选中项变强调色，不做按钮/下划线 */
const NAV =
  'inline-flex flex-none items-center gap-1 whitespace-nowrap text-nav-sm text-ink-2 transition hover:text-ink [&.router-link-active]:text-primary';

/** 一级分类的图标按 alias 认；接口里新增的分类没配图标就不画，不猜 */
const CATEGORY_ICONS: Record<string, Component> = {
  dianying: Film,
  juji: Tv,
  zongyi: Clapperboard,
  dongman: Sparkles,
};

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
  <!-- 顶栏在流里占位（不浮在 hero 上）；半透明 + 模糊，滚动时底下内容能透出来 -->
  <header class="sticky top-0 z-50 border-b border-line/70 bg-glass backdrop-blur-xl">
    <Container>
      <div class="flex h-[var(--header-h)] items-center gap-8">
        <RouterLink to="/" class="flex flex-none items-center gap-2 transition-opacity hover:opacity-90">
          <!-- v2 主题的站点图标（public/img/logo.png，与 themes/default/assets/img/logo.png 同一份） -->
          <img
            src="/img/logo.png"
            :alt="site.config.siteName"
            width="28"
            height="28"
            class="h-7 w-7 flex-none rounded-md"
          />
          <span class="whitespace-nowrap text-logo font-extrabold tracking-tight text-ink">
            {{ site.config.siteName }}
          </span>
        </RouterLink>

        <nav class="hidden min-w-0 flex-1 items-center gap-8 lg:flex" aria-label="分类导航">
          <RouterLink to="/" :class="NAV">
            <House :size="16" class="shrink-0" />
            <span>首页</span>
          </RouterLink>
          <RouterLink v-for="cat in navCategories" :key="cat.id" :to="`/list/${cat.alias}`" :class="NAV">
            <component :is="CATEGORY_ICONS[cat.alias]" v-if="CATEGORY_ICONS[cat.alias]" :size="16" class="shrink-0" />
            <span>{{ cat.name }}</span>
          </RouterLink>
        </nav>

        <form
          class="ml-auto hidden h-9 w-[230px] flex-none items-center gap-2 rounded-pill border border-line bg-surface-2 px-4 text-ink-3 transition hover:border-ink-3/50 hover:text-ink focus-within:border-primary-line focus-within:text-ink lg:flex"
          role="search"
          @submit.prevent="submit"
        >
          <Search :size="14" class="shrink-0" />
          <input
            v-model="keyword"
            type="search"
            name="wd"
            maxlength="50"
            placeholder="搜索片名、演员"
            aria-label="搜索影片"
            class="h-full min-w-0 flex-1 border-0 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
          />
        </form>

        <div class="ml-auto flex items-center gap-1 lg:hidden">
          <RouterLink
            to="/search"
            class="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            aria-label="搜索"
          >
            <Search :size="20" class="shrink-0" />
          </RouterLink>
          <button
            type="button"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            aria-label="分类菜单"
            @click="navOpen = true"
          >
            <Menu :size="20" class="shrink-0" />
          </button>
        </div>
      </div>
    </Container>

    <Sheet v-model:open="navOpen" title="分类" side="left">
      <nav class="flex flex-col gap-1" aria-label="分类导航">
        <button
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-left text-body text-ink transition hover:bg-surface-2"
          @click="go('/')"
        >
          <House :size="16" class="shrink-0" />
          首页
        </button>
        <button
          v-for="cat in site.categories"
          :key="cat.id"
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-left text-body text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          @click="go(`/list/${cat.alias}`)"
        >
          <component :is="CATEGORY_ICONS[cat.alias]" v-if="CATEGORY_ICONS[cat.alias]" :size="16" class="shrink-0" />
          {{ cat.name }}
        </button>
      </nav>
    </Sheet>
  </header>
</template>
