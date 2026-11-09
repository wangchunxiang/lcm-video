import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ResponseInterceptor } from './common/response.interceptor';

/**
 * 进程入口。三件事：全局信封、统一异常出口、监听端口。
 * 启动：npm run dev（nest start --watch，.env 由 ConfigModule 读取）。
 * 生产：npm run build && npm start（node --env-file=../../.env dist/main.js）。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

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

  app.useGlobalInterceptors(new ResponseInterceptor<unknown>(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
}

void bootstrap();
