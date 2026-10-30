import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
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

  app.get('/assets/*', async (req, reply) => {
    const wildcard = (req.params as Record<string, string>)['*'] ?? '';
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
  });
};
