import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppValidationPipe } from './common/pipes/validation.pipe';

/**
 * 进程入口。四件事：入参校验、统一信封、统一异常出口、监听端口。
 * 启动：npm run dev（nest start --watch，.env 由 ConfigModule 读取）。
 * 生产：npm run build && npm start（node --env-file=../../.env dist/main.js）。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // 列表接口返回的 JSON 体积不小（封面地址、简介），压缩能省 3~4 倍带宽。
  app.use(compression());
  // 安全响应头。CSP 关掉：这里只回 JSON，页面由前端应用自己托管；
  // 资源跨域放开：封面图以后可能由本进程直接托管。
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
}

void bootstrap();
