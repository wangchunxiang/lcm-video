import { reactive } from 'vue';
import { portal, type CategoryNode, type SiteConfig } from './api/portal';

/**
 * 全站共享的站点配置与分类树。
 * 配置失败时用兜底值渲染，页面不因为 /api/web/config 不可用而白屏。
 */
const DEFAULT_CONFIG: SiteConfig = {
  siteName: '蓝草莓影视',
  siteSubtitle: '高清影视在线观看',
  siteDisclaimer: '',
  siteStatsCode: '',
  listPageSize: 24,
  player: {
    autoplay: false,
    autonext: true,
    resume: true,
    screenshot: false,
    fullscreen: true,
    webfullscreen: true,
    setting: false,
  },
};

export const site = reactive({
  config: { ...DEFAULT_CONFIG, player: { ...DEFAULT_CONFIG.player } } as SiteConfig,
  categories: [] as CategoryNode[],
  ready: false,
});

/** 只在应用启动时调用一次；失败也标记 ready，避免页头无限等待。 */
export async function loadSite(): Promise<void> {
  const [config, categories] = await Promise.allSettled([
    portal.config(),
    portal.categories(),
  ]);

  if (config.status === 'fulfilled' && config.value) {
    site.config = {
      ...site.config,
      ...config.value,
      player: { ...site.config.player, ...config.value.player },
    };
  }
  if (categories.status === 'fulfilled' && Array.isArray(categories.value)) {
    site.categories = categories.value;
  }
  site.ready = true;
}

/**
 * 列表页的兜底分类：`/list` 或历史遗留的 `/list/all` 都落到第一个一级分类。
 * 分类还没加载完时用 `dianying`（站内永远存在的电影频道）。
 */
export function defaultListAlias(): string {
  return site.categories[0]?.alias || 'dianying';
}

