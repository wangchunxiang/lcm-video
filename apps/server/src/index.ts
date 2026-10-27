import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createDb } from '@lcm/db';
import { env } from './env.ts';
import { createRequireAdmin } from './lib/auth-guard.ts';
import { renderErrorPage } from './lib/theme.ts';
import { startScheduler } from './lib/collect/scheduler.ts';
import { closeInterruptedLogs } from './lib/collect/runner.ts';
import { adminAuthRoutes } from './routes/admin/auth.ts';
import { accountRoutes } from './routes/admin/account.ts';
import { categoryRoutes } from './routes/admin/categories.ts';
import { lineRoutes } from './routes/admin/lines.ts';
import { logRoutes } from './routes/admin/logs.ts';
import { settingRoutes } from './routes/admin/settings.ts';
import { sourceCategoryRoutes } from './routes/admin/source-categories.ts';
import { sourceRoutes } from './routes/admin/sources.ts';
import { taskRoutes } from './routes/admin/tasks.ts';
import { dashboardRoutes } from './routes/admin/dashboard.ts';
import { toolRoutes } from './routes/admin/tools.ts';
import { uploadRoutes } from './routes/admin/upload.ts';
import { playRoutes, vodRoutes } from './routes/admin/vods.ts';
import { serializeDates } from './lib/serialize-dates.ts';
import { themeAssetRoutes } from './routes/site/assets.ts';
import { siteRoutes } from './routes/site/index.ts';
import './types.ts';

const app = Fastify({
  logger: {
    level: env.nodeEnv === 'production' ? 'info' : 'debug',
  },
  trustProxy: true,
});

const { db, pool } = createDb(env.db);
const requireAdmin = createRequireAdmin(db, env.jwtSecret);

await mkdir(env.paths.uploadDir, { recursive: true });

await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
});
await app.register(fastifyStatic, {
  root: env.paths.uploadDir,
  prefix: '/uploads/',
  maxAge: '30d',
  decorateReply: false,
});

app.get('/healthz', async () => ({
  ok: true,
  time: new Date().toISOString(),
}));

// 前台：LiquidJS SSR 页面 + 主题静态资源
await app.register(themeAssetRoutes, { db });
await app.register(siteRoutes, { db });

// 后台：生产环境由同一进程托管构建产物（开发期由 Vite 提供）
const adminDist = `${env.paths.rootDir}/apps/admin/dist`;
const hasAdminDist = existsSync(`${adminDist}/index.html`);
if (hasAdminDist) {
  await app.register(fastifyStatic, {
    root: adminDist,
    prefix: '/admin/',
    wildcard: true,
  });
}

await app.register(adminAuthRoutes, {
  prefix: '/api/admin/auth',
  db,
  env,
});

// 其余后台接口统一要求登录
await app.register(
  async (admin) => {
    admin.addHook('preHandler', requireAdmin);
    await admin.register(categoryRoutes, { prefix: '/categories', db });
    await admin.register(settingRoutes, { prefix: '/settings', db, env });
    await admin.register(accountRoutes, { prefix: '/account', db });
    await admin.register(uploadRoutes, { prefix: '/upload', db, env });
    await admin.register(sourceRoutes, { prefix: '/sources', db });
    await admin.register(sourceCategoryRoutes, { prefix: '/sources', db });
    await admin.register(taskRoutes, { prefix: '/tasks', db });
    await admin.register(logRoutes, { prefix: '/logs', db });
    await admin.register(lineRoutes, { prefix: '/lines', db });
    await admin.register(vodRoutes, { prefix: '/vods', db });
    await admin.register(playRoutes, { prefix: '/plays', db });
    await admin.register(dashboardRoutes, { prefix: '/dashboard', db });
    await admin.register(toolRoutes, { prefix: '/tools', db });
  },
  { prefix: '/api/admin' },
);

app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ code: 40400, msg: '接口不存在', data: null });
  }
  if (req.url === '/admin') {
    return reply.redirect('/admin/');
  }
  if (hasAdminDist && req.url.startsWith('/admin/')) {
    return reply.type('text/html; charset=utf-8').sendFile('index.html', adminDist);
  }
  return renderErrorPage(db, reply, 404, '页面不存在或已被移除');
});

// 响出口统一把 Date 格式化为本地时间字符串
app.addHook('preSerialization', async (_req, reply, payload) => {
  if (!reply.getHeader('content-type')) return payload;
  return serializeDates(payload);
});

app.setErrorHandler((error: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      code: error.statusCode * 100,
      msg: error.message,
      data: null,
    });
  }
  req.log.error(error);
  return reply.code(500).send({ code: 50000, msg: '服务器内部错误', data: null });
});

const close = async (signal: string) => {
  app.log.info(`收到 ${signal}，正在关闭服务`);
  stopScheduler();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void close('SIGINT'));
process.on('SIGTERM', () => void close('SIGTERM'));

const interrupted = await closeInterruptedLogs(db);
if (interrupted > 0) app.log.warn(`收尾 ${interrupted} 条中断的采集记录`);

const stopScheduler = startScheduler(db, {
  info: (message) => app.log.info(message),
  error: (error, message) => app.log.error(error instanceof Error ? error : { error }, message),
});

try {
  await app.listen({ host: env.host, port: env.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
