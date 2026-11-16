import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppValidationPipe } from './common/pipes/validation.pipe';

/**
 * 前端是 history 路由，刷新 `/list/xxx` 这类深链会直接打到服务端。
 * 规则：非 `/api`、非 `/healthz`、非静态文件（无扩展名）的 GET/HEAD 一律回 index.html；
 * 其余交给 Nest 的路由与异常过滤器。
 */
function spaFallback(prefix: string, dist: string): (request: Request, response: Response, next: NextFunction) => void {
  const indexFile = join(dist, 'index.html');
  // 接口与探针必须留在 Nest 手里，否则会被 index.html 抢先
  const owned = (path: string): boolean => path === '/api' || path.startsWith('/api/') || path === '/healthz';
  return (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    if (owned(request.path)) return next();
    if (prefix === '/admin') {
      if (request.path === '/admin') {
        response.redirect(301, '/admin/');
        return;
      }
      if (!request.path.startsWith('/admin/')) return next();
    } else if (request.path.startsWith('/admin')) {
      // 后台的深链不归前台兜底
      return next();
    }
    // 有扩展名说明是在要静态文件，没命中就是真 404，别再回 HTML
    if (extname(request.path) !== '') return next();
    response.sendFile(indexFile);
  };
}

/**
 * 进程入口。四件事：入参校验、统一信封、统一异常出口、监听端口。
 * 启动：npm run dev（nest start --watch，.env 由 ConfigModule 读取）。
 * 生产：npm run build && npm start（node --env-file=../../.env dist/main.js）。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // 列表接口返回的 JSON 体积不小（封面地址、简介），压缩能省 3~4 倍带宽。
  app.use(compression());
  // 安全响应头。CSP 关掉：页面与接口同源，静态资源由下面这段托管；
  // 资源跨域放开：封面图以后可能由本进程直接托管。
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // 静态页面：构建产物存在时由本进程托管（后台 /admin/、前台 /）。
  // 开发时前端各自跑 vite dev server，dist 可能不存在，跳过即可。
  // 放在 Nest 路由之前注册，命中就结束，不会走到统一信封。
  //
  // 缓存策略：`/assets/` 下的文件名带内容哈希，内容一变文件名就变，可以永久缓存；
  // 其余（index.html、图标等固定名字）只缓存 1 小时，发版后能及时更新。
  const staticCache = () => ({
    index: 'index.html' as const,
    maxAge: '1h',
    setHeaders: (response: Response, path: string) => {
      if (path.includes(`${sep}assets${sep}`)) {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  const adminDist = join(__dirname, '../../admin/dist');
  if (existsSync(join(adminDist, 'index.html'))) {
    app.useStaticAssets(adminDist, { prefix: '/admin/', ...staticCache() });
    app.use(spaFallback('/admin', adminDist));
  }

  const webDist = join(__dirname, '../../web/dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, staticCache());
    app.use(spaFallback('/', webDist));
  }

  // 决策 2.3：HTTP 状态码一律 200，语义放在信封的 code 里。
  // Nest 对 POST 默认回 201，这里统一压回 200。
  app.use((request: Request, response: Response, next: NextFunction) => {
    void request;
    const sendJson = response.json.bind(response);
    response.json = (body?: unknown) => {
      response.status(200);
      return sendJson(body);
    };
    next();
  });

  app.useGlobalPipes(new AppValidationPipe());
  app.useGlobalInterceptors(new ResponseInterceptor<unknown>(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  // 端口来自校验过的配置快照（config/configuration.ts），不再直接摸 process.env
  const port = app.get(ConfigService).getOrThrow<number>('app.port');
  await app.listen(port);
}

void bootstrap();
