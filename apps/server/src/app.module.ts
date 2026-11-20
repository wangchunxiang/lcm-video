import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import { HealthModule } from './modules/health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { configuration } from './config/configuration';
import { validateEnv } from './config/validation.schema';
import { createDataSourceOptions } from './config/typeorm.config';
import { adoptExistingSchema } from './database/schema-bootstrap';
import { SeedBootstrapService } from './database/seed-bootstrap.service';
import { AdminUserModule } from './modules/admin-user/admin-user.module';
import { CategoryModule } from './modules/category/category.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdFeatureModule } from './modules/ad-feature/ad-feature.module';
import { VodMergeIgnoreModule } from './modules/vod-merge-ignore/vod-merge-ignore.module';
import { VodMergeRuleModule } from './modules/vod-merge-rule/vod-merge-rule.module';
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
import { PortalModule } from './modules/portal/portal.module';
import { SettingModule } from './modules/setting/setting.module';
import { CollectModule } from './modules/collect/collect.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        // LOG_LEVEL 给测试与本地调试用（e2e 里设 silent，避免每个请求都打一行）
        logger: pino({
          level:
            process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        }),
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
      useFactory: async (config: ConfigService) => {
        const options = createDataSourceOptions(config.getOrThrow<string>('app.databaseUrl'));
        // 老库（有表、没有 migrations 记录）先登记为已迁移，避免 baseline 重复建表。
        await adoptExistingSchema(options);
        return options;
      },
    }),
    SettingModule,
    AdminUserModule,
    CategoryModule,
    DashboardModule,
    HealthModule,
    PlayLineModule,
    AdFeatureModule,
    VodMergeIgnoreModule,
    VodMergeRuleModule,
    SourceRuleModule,
    CoverCheckModule,
    CollectTaskModule,
    CollectTaskLogModule,
    CollectTaskLogDetailModule,
    CollectSourceCategoryModule,
    CollectSourceModule,
    VodModule,
    VodPlayModule,
    PortalModule,
    CollectModule,
  ],
  controllers: [],
  providers: [
    // 全局登录守卫：除 @Public() 外所有接口都要带 token（决策 5.3）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 空库启动时补初始分类 / 站点配置 / 管理员（见 database/seed-bootstrap.ts）
    SeedBootstrapService,
  ],
})
export class AppModule {}
