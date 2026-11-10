import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectRunner } from '../../jobs/collect/runner';
import type { StartResult } from '../../jobs/collect/runner';
import { CollectTaskLogEntity } from './collect-task-log.entity';

/** 采集记录：标准 REST + 断点续采 / 停止。 */
@Injectable()
export class CollectTaskLogService extends AppCrudService<CollectTaskLogEntity> {
  constructor(
    @InjectRepository(CollectTaskLogEntity) repository: Repository<CollectTaskLogEntity>,
    private readonly runner: CollectRunner,
  ) {
    super(repository);
  }

  /** 从上次停下的页码继续采集。 */
  async resume(id: string): Promise<StartResult> {
    return this.runner.startResume(id);
  }

  /** 停止这条记录对应的采集。 */
  async cancel(id: string): Promise<{ stopped: boolean }> {
    const stopped = await this.runner.cancel(id);
    if (!stopped) throw new BadRequestException('该记录当前没有在执行');
    return { stopped };
  }
}
