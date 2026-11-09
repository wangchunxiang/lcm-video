import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import { HealthController } from './common/health.controller';
import { validateEnv } from './config/env';
import { CategoryModule } from './modules/category/category.module';
import { SettingModule } from './modules/setting/setting.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        logger: pino({ level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' }),
        // 探活接口每 30 秒一次，不记访问日志
        autoLogging: { ignore: (req) => req.url === '/healthz' },
        // 请求 ID：优先用调用方传入的，返回头里回写一份，出错时随信封返回
        genReqId: (req, res) => {
          const header = req.headers['x-request-id'];
          const id = typeof header === 'string' && header.length > 0 ? header : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
      },
    }),
    PrismaModule,
    SettingModule,
    CategoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
