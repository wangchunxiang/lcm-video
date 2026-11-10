import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectRunner } from '../../jobs/collect/runner';
import type { StartResult } from '../../jobs/collect/runner';
import { CollectTaskEntity } from './collect-task.entity';

/** 采集任务：标准 REST + 立即执行 / 取消。 */
@Injectable()
export class CollectTaskService extends AppCrudService<CollectTaskEntity> {
  constructor(
    @InjectRepository(CollectTaskEntity) repository: Repository<CollectTaskEntity>,
    private readonly runner: CollectRunner,
  ) {
    super(repository);
  }

  /** 手动触发一次任务；抢不到锁说明已经在跑。 */
  async run(id: string): Promise<StartResult> {
    return this.runner.startTask(id, 'manual');
  }

  /** 停止该任务正在跑的记录。 */
  async cancel(id: string): Promise<{ stopped: boolean }> {
    const stopped = await this.runner.cancelByTask(id);
    if (!stopped) throw new BadRequestException('该任务没有正在执行的采集');
    return { stopped };
  }
}
