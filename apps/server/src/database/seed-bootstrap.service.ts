import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { bootstrapSeed } from './seed-bootstrap';

/**
 * 启动时补空库的初始数据。
 *
 * 放在 OnApplicationBootstrap 而不是 TypeORM 的工厂里：此时迁移已经执行完
 * （`migrationsRun: true` 在 DataSource 初始化阶段完成），表一定存在。
 */
@Injectable()
export class SeedBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedBootstrapService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await bootstrapSeed(this.dataSource, this.logger);
    } catch (error) {
      // 初始化失败不应该让整个站点起不来：分类/配置可以之后补，前台仍可访问。
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`空库初始化失败：${message}`);
    }
  }
}
