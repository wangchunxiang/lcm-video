<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { portal, type VodCard as VodCardData } from '../api/portal';
import { site } from '../site';
import { useSeo } from '../composables/useSeo';
import VodSection from '../components/VodSection.vue';
import Container from '../components/layout/Container.vue';
import GridSkeleton from '../components/ui/GridSkeleton.vue';

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
    today.value = home.rows.flatMap((row) => row.items);
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
      try {
        // 不传 sort：默认按 collected_at（有索引）；sort=new 走无索引的 created_at，12 万行要 10 秒以上
        const page = await portal.list(section.alias, { take: SECTION_SIZE });
        sections.value[index] = {
          alias: section.alias,
          title: section.title,
          items: page.items,
          total: page.total,
          ready: true,
        };
      } catch {
        sections.value[index] = {
          alias: section.alias,
          title: section.title,
          items: [],
          total: 0,
          ready: true,
        };
      }
    }),
  );
}

onMounted(async () => {
  await loadToday();
  void loadSections();
});

useSeo(() => ({
  title: `${site.config.siteName} - ${site.config.siteSubtitle}`,
  description: site.config.siteSubtitle,
}));
</script>

<template>
  <div class="flex flex-col">
    <Container v-if="loading" class="flex flex-col gap-8 pt-4">
      <GridSkeleton />
      <GridSkeleton />
    </Container>

    <p v-else-if="error" class="py-16 text-center text-body text-danger">{{ error }}</p>

    <Container v-else class="flex flex-col gap-8 pt-4">
      <VodSection
        v-if="today.length"
        title="今日更新"
        :sub="`${today.length} 部`"
        :items="today"
      />

      <template v-for="section in sections" :key="section.alias">
        <VodSection
          v-if="section.ready && section.items.length"
          :title="section.title"
          :sub="`在库 ${section.total.toLocaleString()} 部`"
          :more="`/list/${section.alias}`"
          :items="section.items"
        />
        <GridSkeleton v-else-if="!section.ready" />
      </template>

      <p
        v-if="!today.length && !sections.some((s) => s.items.length)"
        class="py-16 text-center text-body text-ink-3"
      >
        暂无影片，先去后台采集一些吧。
      </p>
    </Container>
  </div>
</template>
