import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { IsString, Matches } from 'class-validator';
import { CollectTaskLogEntity } from './collect-task-log.entity';
import { CollectTaskLogService } from './collect-task-log.service';
import type { StartResult } from '../collect/runner';
import { CreateCollectTaskLogDTO, UpdateCollectTaskLogDTO } from './dto/collect-task-log.dto';

/** 只带记录 id 的入参。 */
class LogIdDTO {
  @IsString({ message: '记录 id 必须是数字' })
  @Matches(/^\d+$/, { message: '记录 id 必须是数字' })
  id!: string;
}

/** 采集记录：标准 REST + 续采 / 停止。 */
@Crud({
  entity: CollectTaskLogEntity,
  path: 'api/admin/collect-task-log',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCollectTaskLogDTO, update: UpdateCollectTaskLogDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class CollectTaskLogController {
  constructor(public readonly service: CollectTaskLogService) {}

  /** 从断点继续采集（失败或已取消的记录都能续）。 */
  @Post('resume')
  resume(@Body() dto: LogIdDTO): Promise<StartResult> {
    return this.service.resume(dto.id);
  }

  /** 停止这次采集。 */
  @Post('cancel')
  cancel(@Body() dto: LogIdDTO): Promise<{ stopped: boolean }> {
    return this.service.cancel(dto.id);
  }
}
