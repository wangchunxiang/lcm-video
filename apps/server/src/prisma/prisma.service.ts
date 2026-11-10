import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** 超过这个耗时就记一条 warn。采集写库、合并工具出问题时靠它定位。 */
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 200);

type QueryEvent = { duration: number; query: string };

/**
 * 全进程共用的 PrismaClient。
 * 连接串来自 .env 的 DATABASE_URL；后台与前台共用同一个连接池（决策 3.6）。
 * 慢查询接 pino 日志：只记耗时和 SQL，参数由 Prisma 自己脱敏。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    // Prisma 的 $on 重载由构造参数的字面量类型推导，这里传的是常量，
    // 生成的类型里拿不到 'query' 分支，只能收窄到我们真正用到的签名。
    const client = this as unknown as {
      $on: (event: 'query', callback: (event: QueryEvent) => void) => void;
    };
    client.$on('query', (event) => {
      if (event.duration >= SLOW_QUERY_MS) {
        this.logger.warn(`慢查询 ${event.duration}ms：${event.query}`);
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
