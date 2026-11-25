import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Not, Repository } from 'typeorm';
import { matchCron } from '@lcm/shared';
import { CollectTaskEntity } from '../collect-task/collect-task.entity';
import { CollectRunner } from './runner';

/** 任务表按分钟对齐的 cron，每 30 秒扫一次即可覆盖，避免漏掉整点 */
const TICK_MS = 30_000;

@Injectable()
export class CollectScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(CollectScheduler.name);

  /** 上一轮扫描还没结束就跳过本轮，防止同一分钟里重复触发 */
  private ticking = false;

  constructor(
    @InjectRepository(CollectTaskEntity)
    private readonly taskRepository: Repository<CollectTaskEntity>,
    private readonly runner: CollectRunner,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 先把上一轮遗留的「运行中」收尾，否则任务会永远显示在跑
    await this.runner.closeInterruptedLogs();
    this.logger.log('采集调度已启动，每 30 秒检查一次任务表');
  }

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.scan();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`采集调度扫描失败：${reason}`);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * 一个 tick 里把所有命中 cron 的任务都启动。
   *
   * 不同源站互不影响，源站级别的并发由 runner 自己挡（同一源站只会有一个
   * 采集在跑）。原来的 v1 调度器就是这么做的；v3 重写时改成了「一次只启动
   * 一个」，结果同一时刻的五个任务里只有 id 最小的两个能挤进那一分钟。
   */
  private async scan(): Promise<void> {
    const now = new Date();
    // cron 精度是分钟：同一分钟内（含上一个 tick）已经跑过就跳过
    const minuteStart = new Date(now.getTime());
    minuteStart.setSeconds(0, 0);

    const tasks = await this.taskRepository.find({
      where: { isEnabled: 1, cron: Not(''), lastRunStatus: Not(1) },
      select: { id: true, name: true, cron: true, lastRunAt: true },
      order: { id: 'ASC' },
    });

    for (const task of tasks) {
      if (!matchCron(task.cron, now)) continue;
      if (task.lastRunAt && task.lastRunAt.getTime() >= minuteStart.getTime()) continue;
      const result = await this.runner.startTask(task.id, 'auto');
      if (result.ok) {
        this.logger.log(`触发采集任务 #${task.id} ${task.name}（log=${result.logId ?? ''}）`);
      } else {
        this.logger.debug(`任务 #${task.id} 未启动：${result.msg ?? ''}`);
      }
    }
  }
}
