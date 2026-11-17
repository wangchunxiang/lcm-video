<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { House } from 'lucide-vue-next';
import { site, topCategoryOf } from '../site';
import { CATEGORY_ICONS } from './layout/categoryIcons';
import { pageCategoryId } from '../composables/usePageCategoryId';

/**
 * 小屏（<sm）底部一级分类导航。
 *
 * 375 宽下顶栏放不下「站名 + 5 个分类」，所以分类下沉到底栏：首页 + 4 个一级分类各一格，
 * 拇指够得到，顶栏只留品牌和搜索（见 docs/样式规范-v3.md 第三节）。
 * ≥640 一律 `hidden`，平板和桌面仍然是顶栏那一行，观感不变。
 *
 * 选中态：列表页看路由 alias；详情页 / 播放页看页面写进来的 categoryId（回溯一级分类）；
 * 首页看路由名；搜索页不属于任何一个分类，就都不亮。
 */
const route = useRoute();

const categories = computed(() => site.categories.slice(0, 4));

const items = computed(() => [
  { label: '首页', to: '/', alias: '', icon: House },
  ...categories.value.map((cat) => ({
    label: cat.name,
    to: `/list/${cat.alias}`,
    alias: cat.alias,
    icon: CATEGORY_ICONS[cat.alias] ?? House,
  })),
]);

const activeAlias = computed(() => {
  if (route.name === 'list') {
    return typeof route.params.alias === 'string' ? route.params.alias : '';
  }
  if (route.name === 'detail' || route.name === 'play') {
    return topCategoryOf(pageCategoryId.value)?.alias ?? '';
  }
  return '';
});

function isActive(alias: string): boolean {
  return alias === '' ? route.name === 'home' : activeAlias.value === alias;
}
</script>

<template>
  <!--
    底栏是 fixed：它不参与文档流，页面末尾用 App.vue 的 padding 让位。
    env(safe-area-inset-bottom) 需要 index.html 的 viewport-fit=cover 才不为 0。
  -->
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
  >
    <div class="flex h-14 items-stretch">
      <RouterLink
        v-for="item in items"
        :key="item.alias || 'home'"
        :to="item.to"
        class="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
        :class="isActive(item.alias) ? 'text-primary' : 'text-ink-3 hover:text-ink-2'"
      >
        <component :is="item.icon" :size="20" class="shrink-0" />
        <span class="text-caption leading-none">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
