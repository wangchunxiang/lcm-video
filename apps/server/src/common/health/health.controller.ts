import { Controller, Get } from '@nestjs/common';
import { schedulerState } from '../../jobs/collect/scheduler';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../security/public.decorator';

/** 探活：不只探数据库，还带上「调度是否还在跳」和进程内存。 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('healthz')
  async health(): Promise<{
    db: string;
    dbMs: number;
    uptimeSec: number;
    rssMb: number;
    runningTasks: number;
    scheduler: { lastTickAt: string | null; ageSec: number | null; lastTickMs: number; lastError: string };
  }> {
    const startedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const dbMs = Date.now() - startedAt;

    // 调度器卡住时（长任务占住线程）数据库仍然是通的，只看 db 会误判为健康。
    const runningTasks = await this.prisma.collectTaskLog.count({ where: { status: 1 } });
    const lastTickAt = schedulerState.lastTickAt;

    return {
      db: 'up',
      dbMs,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      runningTasks,
      scheduler: {
        lastTickAt: lastTickAt ? lastTickAt.toISOString() : null,
        ageSec: lastTickAt ? Math.round((Date.now() - lastTickAt.getTime()) / 1000) : null,
        lastTickMs: schedulerState.lastTickMs,
        lastError: schedulerState.lastError,
      },
    };
  }
}
