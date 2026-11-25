<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { portal, type VodCard as VodCardData } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodSection from '../components/VodSection.vue';
import Container from '../components/layout/Container.vue';
import SectionSkeleton from '../components/ui/SectionSkeleton.vue';

/**
 * 首页内容区：今日更新 + 四个一级分类。
 *
 * 顺序与顶部导航一致（今日更新 → 电影 → 剧集 → 综艺 → 动漫）；
 * 每块是 8 列 × 2 行的海报网格（大屏 16 部，窄屏自动折行）。
 * 分区接口要按分类统计总数，单次要 3 秒左右，所以今日更新先出，
 * 四个分类各自回来各自渲染，不整页等最慢的一块。
 */
/** 每块取 16 部 = 8 列 × 2 行 */
const SECTION_SIZE = 16;

/** 一级分类顺序固定，别名与后端 /api/web/list/:alias 一致 */
const CATEGORY_SECTIONS = [
  { alias: 'dianying', title: '电影' },
  { alias: 'juji', title: '剧集' },
  { alias: 'zongyi', title: '综艺' },
  { alias: 'dongman', title: '动漫' },
] as const;

interface Section {
  alias: string;
  title: string;
  items: VodCardData[];
  total: number;
  /** 该分类的请求是否已结束（成功或失败都算结束），false 时渲染骨架 */
  ready: boolean;
}

const loading = ref(true);
const error = ref('');
const today = ref<VodCardData[]>([]);
/** 今日更新的当天总条数；首页只展示前 16 部，标题后的「N 部」用这个真实数量 */
const todayTotal = ref(0);

const sections = ref<Section[]>(
  CATEGORY_SECTIONS.map((section) => ({
    alias: section.alias,
    title: section.title,
    items: [],
    total: 0,
    ready: false,
  })),
);

/** 首屏：今日更新（/home 一次请求，几十毫秒） */
async function loadToday(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const home = await portal.home();
    const row = home.rows[0];
    today.value = row?.items ?? [];
    todayTotal.value = row?.total ?? today.value.length;
  } catch (e) {
    error.value = (e as Error).message || '首页加载失败';
  } finally {
    loading.value = false;
  }
}

/** 四个一级分类：并发拉，谁回来填谁 */
async function loadSections(): Promise<void> {
  await Promise.all(
    CATEGORY_SECTIONS.map(async (section, index) => {
      // 两块分支只差 items/total，标题与 ready 写一份
      const base = { alias: section.alias, title: section.title, ready: true };
      try {
        // 不传 sort：默认按 collected_at（有索引）；sort=new 走无索引的 created_at，12 万行要 10 秒以上
        const page = await portal.list(section.alias, { take: SECTION_SIZE });
        sections.value[index] = { ...base, items: page.items, total: page.total };
      } catch {
        sections.value[index] = { ...base, items: [], total: 0 };
      }
    }),
  );
}

onMounted(() => {
  // 两个接口互不依赖，并发发出去：分类单次要 3 秒，串行等于白等一个来回
  void loadToday();
  void loadSections();
});

useSeo(() => ({
  title: `${site.config.siteName} - ${site.config.siteSubtitle}`,
  description: site.config.siteSubtitle,
}));
</script>

<template>
  <div class="flex flex-col">
    <Container class="flex flex-col gap-8 pt-4">
      <!-- 首屏一次性摆满 5 块（今日更新 + 4 个一级分类），与最终版式一致 -->
      <SectionSkeleton v-if="loading" />
      <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>
      <VodSection
        v-else-if="today.length"
        title="今日更新"
        :sub="`${todayTotal} 部`"
        :items="today"
        :eager-count="8"
      />

      <template v-for="(section, index) in sections" :key="section.alias">
        <VodSection
          v-if="section.ready && section.items.length"
          :title="section.title"
          :sub="`在库 ${section.total.toLocaleString()} 部`"
          :more="`/list/${section.alias}`"
          :items="section.items"
          :eager-count="!today.length && index === 0 ? 8 : 0"
        />
        <SectionSkeleton v-else-if="!section.ready" />
      </template>

      <p
        v-if="!loading && !error && !today.length && !sections.some((s) => s.items.length)"
        class="py-16 text-center text-body text-ink-3"
      >
        暂无影片，先去后台采集一些吧。
      </p>
    </Container>
  </div>
</template>
