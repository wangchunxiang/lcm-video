import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

/** 探活：不只看数据库，还带上进程内存与在跑的采集数。 */
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get('healthz')
  async health(): Promise<{
    db: string;
    dbMs: number;
    uptimeSec: number;
    rssMb: number;
    runningTasks: number;
  }> {
    const startedAt = Date.now();
    await this.dataSource.query('SELECT 1');
    const dbMs = Date.now() - startedAt;

    const rows = await this.dataSource.query<Array<{ total: string }>>(
      'SELECT COUNT(*) AS total FROM lcm_collect_task_log WHERE status = 1',
    );

    return {
      db: 'up',
      dbMs,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      runningTasks: Number(rows.at(0)?.total ?? 0),
    };
  }
}
