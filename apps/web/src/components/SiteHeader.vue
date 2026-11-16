<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Clapperboard, Film, House, Search, Sparkles, Tv } from 'lucide-vue-next';
import { site } from '../site';
import Container from './layout/Container.vue';

/**
 * 页面骨架的「顶部」。
 *
 * 三段结构固定：品牌 → 一级分类导航 → 搜索。
 * 高度取 --header-h；底色恒定半透明 + 模糊，滚动时底下内容能透出来。
 * 小屏（<sm）只留 logo 图标、隐藏站名，分类导航退成纯文字，一行放得下。
 */
const router = useRouter();
const route = useRoute();
const keyword = ref('');

/**
 * 顶栏输入框与搜索结果页共用同一个关键词：
 * 搜索页（有 wd）在桌面端不重复画输入框，用户直接在顶栏改词回车即可。
 */
watch(
  () => route.query.wd,
  (value) => {
    keyword.value = typeof value === 'string' ? value : '';
  },
  { immediate: true },
);

/** 顶部导航只放一级分类（与首页的区块一一对应），子分类留给列表页筛选 */
const navCategories = computed(() => site.categories.slice(0, 6));

/** 导航就是一行文字：选中项变强调色，不做按钮/下划线 */
const NAV =
  'inline-flex flex-none items-center gap-1 whitespace-nowrap text-nav-sm text-ink-2 transition hover:text-ink [&.router-link-active]:text-primary';

/** 分类图标在小屏不画：一行五六个分类要挤进 375，图标会让每一项宽出 18px */
const NAV_ICON = 'hidden shrink-0 sm:block';

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

/**
 * 小屏搜索：点图标不跳页，就地展开一个输入框，旁边留「取消」。
 * 误点直接点取消（或按 Esc）就收回去，不会多一次页面跳转。
 */
const searchOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);

async function openSearch(): Promise<void> {
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function closeSearch(): void {
  searchOpen.value = false;
}

function submitMobile(): void {
  const wd = keyword.value.trim();
  if (!wd) {
    closeSearch();
    return;
  }
  void router.push({ name: 'search', query: { wd } });
  closeSearch();
}
</script>

<template>
  <!-- 顶栏在流里占位（不浮在内容上）；半透明 + 模糊，滚动时底下内容能透出来 -->
  <header class="sticky top-0 z-50 border-b border-line/70 bg-glass backdrop-blur-xl">
    <Container>
      <div
        class="h-[var(--header-h)] items-center gap-2 lg:gap-8"
        :class="searchOpen ? 'hidden lg:flex' : 'flex'"
      >
        <RouterLink to="/" class="flex flex-none items-center gap-2 transition-opacity hover:opacity-90">
          <!-- v2 主题的站点图标（public/img/logo.png，与 themes/default/assets/img/logo.png 同一份） -->
          <img
            src="/img/logo.png"
            :alt="site.config.siteName"
            width="28"
            height="28"
            class="h-7 w-7 flex-none rounded-md"
          />
          <!-- 小屏把站名让给分类：375 宽下站名占 120px，五个分类就放不下了 -->
          <span class="hidden whitespace-nowrap text-logo font-extrabold tracking-tight text-ink sm:inline">
            {{ site.config.siteName }}
          </span>
        </RouterLink>

        <nav
          class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:gap-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:gap-8"
          aria-label="分类导航"
        >
          <RouterLink to="/" :class="NAV">
            <House :size="16" :class="NAV_ICON" />
            <span>首页</span>
          </RouterLink>
          <RouterLink v-for="cat in navCategories" :key="cat.id" :to="`/list/${cat.alias}`" :class="NAV">
            <component :is="CATEGORY_ICONS[cat.alias]" v-if="CATEGORY_ICONS[cat.alias]" :size="16" :class="NAV_ICON" />
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

        <button
          type="button"
          class="ml-auto flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="搜索"
          @click="openSearch"
        >
          <Search :size="20" class="shrink-0" />
        </button>
      </div>

      <!-- 小屏展开的搜索行：取消/Esc 收起，回车跳到搜索结果页 -->
      <div v-if="searchOpen" class="flex h-[var(--header-h)] items-center gap-2 lg:hidden">
        <form
          class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-pill border border-line bg-surface-2 px-4 text-ink-3 transition focus-within:border-primary-line focus-within:text-ink"
          role="search"
          @submit.prevent="submitMobile"
        >
          <Search :size="14" class="shrink-0" />
          <input
            ref="searchInput"
            v-model="keyword"
            type="search"
            name="wd"
            maxlength="50"
            placeholder="搜索片名、演员"
            aria-label="搜索影片"
            class="h-full min-w-0 flex-1 border-0 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
            @keydown.esc="closeSearch"
          />
        </form>
        <button
          type="button"
          class="h-9 flex-none cursor-pointer px-2 text-small text-ink-2 transition hover:text-ink"
          @click="closeSearch"
        >
          取消
        </button>
      </div>
    </Container>
  </header>
</template>
