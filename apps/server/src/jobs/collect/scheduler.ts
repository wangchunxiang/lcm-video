import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Not, Repository } from 'typeorm';
import { matchCron } from '@lcm/shared';
import { CollectTaskEntity } from '../../modules/collect-task/collect-task.entity';
import { CollectRunner } from './runner';

/** 任务表按分钟对齐的 cron，每 30 秒扫一次即可覆盖，避免漏掉整点 */
const TICK_MS = 30_000;

/** 调度器心跳：/healthz 用它判断「进程活着但调度卡死」。 */
export const schedulerState: {
  lastTickAt: Date | null;
  lastTickMs: number;
  lastError: string;
} = { lastTickAt: null, lastTickMs: 0, lastError: '' };

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
    const startedAt = Date.now();
    try {
      await this.scan();
      schedulerState.lastError = '';
    } catch (error) {
      schedulerState.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`采集调度扫描失败：${schedulerState.lastError}`);
    } finally {
      schedulerState.lastTickAt = new Date();
      schedulerState.lastTickMs = Date.now() - startedAt;
      this.ticking = false;
    }
  }

  /** 本轮最多启动一个任务：同一时刻只跑一路采集，避免多个任务同时打远端 */
  private async scan(): Promise<void> {
    const now = new Date();
    const tasks = await this.taskRepository.find({
      where: { isEnabled: 1, cron: Not(''), lastRunStatus: Not(1) },
      select: { id: true, name: true, cron: true, lastRunAt: true },
      order: { id: 'ASC' },
    });

    for (const task of tasks) {
      if (!matchCron(task.cron, now)) continue;
      // cron 精度是分钟：同一分钟内（含上一个 tick）已经跑过就跳过
      if (task.lastRunAt && now.getTime() - task.lastRunAt.getTime() < 60_000) continue;
      const result = await this.runner.startTask(task.id, 'auto');
      if (result.ok) {
        this.logger.log(`触发采集任务 #${task.id} ${task.name}（log=${result.logId ?? ''}）`);
        return;
      }
      this.logger.debug(`任务 #${task.id} 未启动：${result.msg ?? ''}`);
    }
  }
}
