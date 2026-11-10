import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import { HealthController } from './common/health.controller';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { validateEnv } from './config/env';
import { AdminUserModule } from './modules/admin-user/admin-user.module';
import { CategoryModule } from './modules/category/category.module';
import { CollectSourceModule } from './modules/collect-source/collect-source.module';
import { CollectSourceCategoryModule } from './modules/collect-source-category/collect-source-category.module';
import { AdFeatureModule } from './modules/ad-feature/ad-feature.module';
import { CoverCheckModule } from './modules/cover-check/cover-check.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { VodMergeIgnoreModule } from './modules/vod-merge-ignore/vod-merge-ignore.module';
import { CollectTaskModule } from './modules/collect-task/collect-task.module';
import { CollectTaskLogModule } from './modules/collect-task-log/collect-task-log.module';
import { CollectTaskLogDetailModule } from './modules/collect-task-log-detail/collect-task-log-detail.module';
import { SourceRuleModule } from './modules/source-rule/source-rule.module';
import { CollectModule } from './jobs/collect/collect.module.js';
import { PlayLineModule } from './modules/play-line/play-line.module';
import { VodPlayModule } from './modules/vod-play/vod-play.module';
import { SettingModule } from './modules/setting/setting.module';
import { VodModule } from './modules/vod/vod.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
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
    AdminUserModule,
    PlayLineModule,
    VodPlayModule,
    VodModule,
    DashboardModule,
    CollectSourceModule,
    CollectModule,
    CollectSourceCategoryModule,
    CollectTaskModule,
    CollectTaskLogModule,
    CollectTaskLogDetailModule,
    SourceRuleModule,
    AdFeatureModule,
    VodMergeIgnoreModule,
    CoverCheckModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局登录守卫：除 @Public() 外所有接口都要带 token（决策 5.3）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
