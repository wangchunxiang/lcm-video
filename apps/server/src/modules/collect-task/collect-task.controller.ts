import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { IsString, Matches } from 'class-validator';
import { CollectTaskEntity } from './collect-task.entity';
import { CollectTaskService } from './collect-task.service';
import type { StartResult } from '../collect/runner';
import { CreateCollectTaskDTO, UpdateCollectTaskDTO } from './dto/collect-task.dto';

/** 只带任务 id 的入参。 */
class TaskIdDTO {
  @IsString({ message: '任务 id 必须是数字' })
  @Matches(/^\d+$/, { message: '任务 id 必须是数字' })
  id!: string;
}

/** 采集任务：标准 REST + 立即执行 / 停止。 */
@Crud({
  entity: CollectTaskEntity,
  path: 'api/admin/collect-task',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCollectTaskDTO, update: UpdateCollectTaskDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class CollectTaskController {
  constructor(public readonly service: CollectTaskService) {}

  /** 立即跑一次（与定时触发同一条链路，抢不到锁返回原因）。 */
  @Post('run')
  run(@Body() dto: TaskIdDTO): Promise<StartResult> {
    return this.service.run(dto.id);
  }

  /** 停止正在跑的采集记录。 */
  @Post('cancel')
  cancel(@Body() dto: TaskIdDTO): Promise<{ stopped: boolean }> {
    return this.service.cancel(dto.id);
  }
}
