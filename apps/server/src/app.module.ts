import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import { HealthController } from './common/health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { validateEnv } from './config/env';
import { createDataSourceOptions } from './database/options';
import { AdminUserModule } from './modules/admin-user/admin-user.module';
import { CategoryModule } from './modules/category/category.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdFeatureModule } from './modules/ad-feature/ad-feature.module';
import { VodMergeIgnoreModule } from './modules/vod-merge-ignore/vod-merge-ignore.module';
import { SourceRuleModule } from './modules/source-rule/source-rule.module';
import { CoverCheckModule } from './modules/cover-check/cover-check.module';
import { CollectTaskModule } from './modules/collect-task/collect-task.module';
import { CollectTaskLogModule } from './modules/collect-task-log/collect-task-log.module';
import { CollectTaskLogDetailModule } from './modules/collect-task-log-detail/collect-task-log-detail.module';
import { CollectSourceCategoryModule } from './modules/collect-source-category/collect-source-category.module';
import { CollectSourceModule } from './modules/collect-source/collect-source.module';
import { VodModule } from './modules/vod/vod.module';
import { VodPlayModule } from './modules/vod-play/vod-play.module';
import { PlayLineModule } from './modules/play-line/play-line.module';
import { SettingModule } from './modules/setting/setting.module';
import { CollectModule } from './jobs/collect/collect.module';

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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createDataSourceOptions(config.getOrThrow<string>('DATABASE_URL')),
    }),
    SettingModule,
    AdminUserModule,
    CategoryModule,
    DashboardModule,
    PlayLineModule,
    AdFeatureModule,
    VodMergeIgnoreModule,
    SourceRuleModule,
    CoverCheckModule,
    CollectTaskModule,
    CollectTaskLogModule,
    CollectTaskLogDetailModule,
    CollectSourceCategoryModule,
    CollectSourceModule,
    VodModule,
    VodPlayModule,
    CollectModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局登录守卫：除 @Public() 外所有接口都要带 token（决策 5.3）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
