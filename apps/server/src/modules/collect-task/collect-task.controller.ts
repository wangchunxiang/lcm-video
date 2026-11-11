import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { IdDTO } from '../../common/dto/id.dto';
import { CollectTaskEntity } from './collect-task.entity';
import { CollectTaskService } from './collect-task.service';
import type { StartResult } from '../collect/runner';
import { CreateCollectTaskDTO, UpdateCollectTaskDTO } from './dto/collect-task.dto';

/** 采集任务：标准 REST + 立即执行 / 停止。 */
@AppCrud({
  entity: CollectTaskEntity,
  path: 'api/admin/collect-task',
  dto: { create: CreateCollectTaskDTO, update: UpdateCollectTaskDTO },
})
export class CollectTaskController {
  constructor(public readonly service: CollectTaskService) {}

  /** 立即跑一次（与定时触发同一条链路，抢不到锁返回原因）。 */
  @Post('run')
  run(@Body() dto: IdDTO): Promise<StartResult> {
    return this.service.run(dto.id);
  }

  /** 停止正在跑的采集记录。 */
  @Post('cancel')
  cancel(@Body() dto: IdDTO): Promise<{ stopped: boolean }> {
    return this.service.cancel(dto.id);
  }
}
