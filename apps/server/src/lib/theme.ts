import { existsSync, statSync } from 'node:fs';
import type { FastifyReply } from 'fastify';
import { Liquid } from 'liquidjs';
import type { Db } from '@lcm/db';
import { category } from '@lcm/db';
import { eq } from 'drizzle-orm';
import { env } from '../env.ts';
import { getAllSettings } from './settings.ts';

export interface SiteConfig {
  name: string;
  subtitle: string;
  logo: string;
  favicon: string;
  icp: string;
  keywords: string;
  description: string;
  disclaimer: string;
  statsCode: string;
  theme: string;
  listPageSize: number;
  autoplay: boolean;
  autonext: boolean;
  resume: boolean;
  volume: number;
  muted: boolean;
  hotkey: boolean;
  screenshot: boolean;
  pip: boolean;
  webfullscreen: boolean;
  setting: boolean;
  loop: boolean;
}

export interface NavItem {
  id: number;
  name: string;
  alias: string;
  children: NavItem[];
}

/** 站点公共配置，每次请求都读库代价高，内存里缓存 60 秒 */
let cachedConfig: { at: number; value: SiteConfig } | null = null;

function volumeOf(raw: string | undefined): number {
  const value = Number(raw ?? '80');
  if (!Number.isFinite(value)) return 80;
  return Math.min(100, Math.max(0, Math.trunc(value)));
}

export async function loadSiteConfig(db: Db): Promise<SiteConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < 60_000) return cachedConfig.value;

  const settings = await getAllSettings(db);
  const pageSize = Number(settings['list_page_size'] ?? '24');
  const value: SiteConfig = {
    name: settings['site_name'] || '蓝草莓影视',
    subtitle: settings['site_subtitle'] || '',
    logo: settings['site_logo'] || '',
    favicon: settings['site_favicon'] || '',
    icp: settings['site_icp'] || '',
    keywords: settings['site_keywords'] || '',
    description: settings['site_description'] || '',
    disclaimer: settings['site_disclaimer'] || '',
    statsCode: settings['site_stats_code'] || '',
    theme: settings['site_theme'] || 'default',
    listPageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(100, Math.trunc(pageSize)) : 24,
    autoplay: settings['player_autoplay'] === '1',
    autonext: settings['player_autonext'] !== '0',
    resume: settings['player_resume'] !== '0',
    volume: volumeOf(settings['player_volume']),
    muted: settings['player_muted'] === '1',
    hotkey: settings['player_hotkey'] !== '0',
    screenshot: settings['player_screenshot'] !== '0',
    pip: settings['player_pip'] !== '0',
    webfullscreen: settings['player_webfullscreen'] === '1',
    setting: settings['player_setting'] !== '0',
    loop: settings['player_loop'] === '1',
  };

  cachedConfig = { at: Date.now(), value };
  return value;
}

/** 清缓存：后台保存设置后调用 */
export function clearSiteConfigCache(): void {
  cachedConfig = null;
}

export async function loadNav(db: Db): Promise<NavItem[]> {
  const rows = await db
    .select({ id: category.id, pid: category.pid, name: category.name, alias: category.alias })
    .from(category)
    .where(eq(category.isShow, 1))
    .orderBy(category.sort, category.id);

  const parents: NavItem[] = [];
  const index = new Map<number, NavItem>();
  for (const row of rows) {
    if (row.pid !== 0) continue;
    const item: NavItem = { id: row.id, name: row.name, alias: row.alias, children: [] };
    parents.push(item);
    index.set(row.id, item);
  }
  for (const row of rows) {
    if (row.pid === 0) continue;
    index.get(row.pid)?.children.push({ id: row.id, name: row.name, alias: row.alias, children: [] });
  }
  return parents;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 解析页码：非数字或小于 1 按 1 处理 */
export function parsePage(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.trunc(n);
}

/** 渲染前台错误页（404 等），供站点路由与全局兜底共用 */
export async function renderErrorPage(
  db: Db,
  reply: FastifyReply,
  status: number,
  message: string,
): Promise<FastifyReply> {
  const config = await loadSiteConfig(db);
  const nav = await loadNav(db);
  const html = await createEngine(config.theme).renderFile('404', {
    site: config,
    nav,
    status,
    message,
    meta: { title: `${status} ${message} - ${config.name}`, description: config.description, noindex: true },
  });
  return reply.code(status).type('text/html; charset=utf-8').send(html);
}

/** 主题名只允许字母数字与下划线，避免路径穿越 */
export function safeThemeName(name: string): string {
  return /^[a-zA-Z0-9_-]+$/.test(name) ? name : 'default';
}

/** 静态资源版本号：取文件 mtime，文件改动后 URL 自动变化，避免浏览器用旧缓存 */
const assetVersionCache = new Map<string, string>();

function assetVersion(themeDir: string, rel: string): string {
  const full = `${themeDir}/assets/${rel}`;
  try {
    const mtime = String(Math.trunc(statSync(full).mtimeMs));
    const cached = assetVersionCache.get(full);
    if (cached === mtime) return mtime;
    assetVersionCache.set(full, mtime);
    return mtime;
  } catch {
    return '';
  }
}

export function createEngine(theme: string): Liquid {
  const safe = safeThemeName(theme);
  const themeDir = existsSync(`${env.paths.themesDir}/${safe}`)
    ? `${env.paths.themesDir}/${safe}`
    : `${env.paths.themesDir}/default`;
  const engine = new Liquid({
    root: [themeDir],
    layouts: [themeDir],
    partials: [themeDir],
    extname: '.liquid',
    cache: env.nodeEnv === 'production',
  });

  engine.registerFilter('asset', (path: string) => {
    const rel = String(path).replace(/^\/+/, '');
    const version = assetVersion(themeDir, rel);
    return version ? `/assets/${rel}?v=${version}` : `/assets/${rel}`;
  });
  engine.registerFilter('qs', (input: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const text = params.toString();
    return text ? `?${text}` : '';
  });
  engine.registerFilter('with_type', (filter: Record<string, unknown>, type: string) => ({
    ...filter,
    type,
  }));
  engine.registerFilter('with_year', (filter: Record<string, unknown>, year: unknown) => ({
    ...filter,
    year: year === 0 ? '' : year,
  }));
  engine.registerFilter('with_sort', (filter: Record<string, unknown>, sort: string) => ({
    ...filter,
    sort,
  }));
  engine.registerFilter('page_url', (base: string, filter: Record<string, unknown>, page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      if (key === 'sort' && value === 'time') continue;
      params.set(key, String(value));
    }
    if (page > 1) params.set('page', String(page));
    const text = params.toString();
    return text ? `${base}?${text}` : base;
  });
  engine.registerFilter('truncate_text', (input: string, length = 120) => {
    const text = String(input ?? '').replace(/\s+/g, ' ').trim();
    return text.length > length ? `${text.slice(0, length)}…` : text;
  });
  engine.registerFilter('date_text', (input: string | Date | null) => {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(String(input).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(input);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });

  return engine;
}
