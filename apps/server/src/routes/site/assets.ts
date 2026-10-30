import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { Db } from '@lcm/db';
import { env } from '../../env.ts';
import { loadSiteConfig, safeThemeName } from '../../lib/theme.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
};

/**
 * 第三方库带 ?v= 版本参数、内容不会变，长缓存；
 * 自己写的脚本和样式还在改，走协商缓存，避免升级后用户看到的还是旧文件。
 */
function cacheControlFor(relative: string, ext: string): string {
  const clean = relative.split(String.fromCharCode(92)).join('/');
  if (clean.startsWith('vendor/') || clean.startsWith('img/')) return 'public, max-age=2592000, immutable';
  if (ext === '.js' || ext === '.css' || ext === '.html') return 'no-cache';
  return 'public, max-age=604800';
}

export interface ThemeAssetOpts {
  db: Db;
}

/** 主题静态资源：/assets/** → themes/<当前主题>/assets/** */
export const themeAssetRoutes: FastifyPluginAsync<ThemeAssetOpts> = async (app, opts) => {
  const { db } = opts;

  /**
   * 浏览器即使页面里写了 <link rel="icon"> 也可能另行请求根路径的 /favicon.ico，
   * 这里直接吐主题里那份，省得每次都 404 刷一条日志。
   */
  async function sendThemeAsset(reply: FastifyReply, wildcard: string) {
    if (!wildcard || wildcard.includes('\0')) return reply.code(404).send('Not Found');

    const config = await loadSiteConfig(db);
    const root = path.resolve(env.paths.themesDir, safeThemeName(config.theme), 'assets');
    const target = path.resolve(root, wildcard);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      return reply.code(404).send('Not Found');
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) return reply.code(404).send('Not Found');
      const ext = path.extname(target).toLowerCase();
      return reply
        .type(MIME[ext] ?? 'application/octet-stream')
        .header('Cache-Control', cacheControlFor(wildcard, ext))
        .send(createReadStream(target));
    } catch {
      return reply.code(404).send('Not Found');
    }
  }

  app.get('/assets/*', async (req, reply) => {
    const wildcard = (req.params as Record<string, string>)['*'] ?? '';
    return sendThemeAsset(reply, wildcard);
  });

  app.get('/favicon.ico', async (_req, reply) => sendThemeAsset(reply, 'favicon.ico'));

  /** Android / PWA 安装图标；名称取站点设置，主题色与前台主色一致 */
  app.get('/site.webmanifest', async (_req, reply) => {
    const config = await loadSiteConfig(db);
    const body = {
      name: config.name,
      short_name: config.name,
      description: config.description,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#2563eb',
      icons: [
        { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    };
    return reply
      .type('application/manifest+json; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(JSON.stringify(body));
  });
};
