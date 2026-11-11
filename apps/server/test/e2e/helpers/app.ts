import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from '../../../src/app.module';
import { AllExceptionsFilter } from '../../../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../../src/common/interceptors/response.interceptor';
import { AppValidationPipe } from '../../../src/common/pipes/validation.pipe';
import { seedFixtures } from './fixtures';
import type { Fixtures } from './fixtures';

export interface TestContext {
  app: INestApplication;
  fixtures: Fixtures;
}

/**
 * 按 `main.ts` 的方式装配一个进程内应用（不监听端口，supertest 自己起临时服务）。
 * 全局管道 / 拦截器 / 过滤器必须与 `main.ts` 保持一致，否则测到的不是线上行为。
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });

  // 决策 2.3：HTTP 状态码一律 200
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
  await app.init();

  const fixtures = await seedFixtures(app);
  return { app, fixtures };
}
