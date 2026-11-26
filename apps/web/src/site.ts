import { reactive } from 'vue';
import { portal, type CategoryNode, type SiteConfig } from './api/portal';

/**
 * 全站共享的站点配置与分类树。
 * 配置失败时用兜底值渲染，页面不因为 /api/web/config 不可用而白屏。
 *
 * player 下各项必须与后台打包值一致（packages/shared/src/settings.ts 的 default + portal.service.ts 的 flag 兜底）：
 * 否则请求慢/失败的那一瞬间，控制栏按钮跟正常情况不一样，看着像“随机丢按钮”。
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
    screenshot: true,
    fullscreen: true,
    webfullscreen: false,
    setting: true,
  },
  coverHosts: [],
};

/**
 * 把服务端下发的封面域名提前握手。
 *
 * 时机是这个方案的全部：必须早于卡片渲染。SPA 里等 JSON 到了再插 `<link>` 已经晚了——
 * `<link>` 和 `<img>` 在同一帧发出，握手来不及完成。这里能赶在图片之前，是因为 `/config`
 * 比首页/列表数据早一个往返，而图片要等数据到了才渲染。
 *
 * 只加 `preconnect` 与 `dns-prefetch`，**不加 `crossorigin`**：普通 `<img>` 走 no-cors 模式，
 * 带 crossorigin 会预热到另一个连接池，等于白预（而且会多一次握手）。
 */
const hintedHosts = new Set<string>();

export function applyCoverHints(hosts: readonly string[] | undefined): void {
  if (!Array.isArray(hosts)) return;
  for (const raw of hosts) {
    const host = String(raw ?? '').trim().toLowerCase();
    // 同源不用预热（本站接口的连接本来就会建）；`/` 与空白一律跳过
    if (!host || host.includes('/') || hintedHosts.has(host)) continue;
    if (host === window.location.hostname) continue;
    hintedHosts.add(host);
    insertLink('preconnect', `https://${host}`);
    // 旧浏览器不认 preconnect，dns-prefetch 至少把 DNS 省下来（两条一起写不会冲突）
    insertLink('dns-prefetch', `https://${host}`);
  }
}

function insertLink(rel: string, href: string): void {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
}

export const site = reactive({
  config: { ...DEFAULT_CONFIG, player: { ...DEFAULT_CONFIG.player } } as SiteConfig,
  categories: [] as CategoryNode[],
  ready: false,
});

let pending: Promise<void> | null = null;

/**
 * 拉站点配置与分类树，全局只发一次。
 * 路由守卫也等它：`/list` 要按第一个一级分类重定向，分类没到就会落到兜底值。
 */
export function ensureSite(): Promise<void> {
  pending ??= loadSite();
  return pending;
}

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
  applyCoverHints(site.config.coverHosts);
  site.ready = true;
}

/**
 * 列表页的兜底分类：`/list` 或历史遗留的 `/list/all` 都落到第一个一级分类。
 * 分类还没加载完时用 `dianying`（站内永远存在的电影频道）。
 */
export function defaultListAlias(): string {
  return site.categories[0]?.alias || 'dianying';
}

/**
 * 影片挂在二级分类上（如「港台剧」），这里回溯到一级分类。
 * 详情页的「手机观看」二维码取地址、移动端底栏的高亮都靠这一份。
 */
export function topCategoryOf(categoryId: string): CategoryNode | null {
  if (!categoryId) return null;
  return (
    site.categories.find(
      (item: CategoryNode) =>
        item.id === categoryId ||
        item.children.some((child: { id: string }) => child.id === categoryId),
    ) ?? null
  );
}

