import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { IdDTO } from '../../common/dto/id.dto';
import { CollectTaskLogEntity } from './collect-task-log.entity';
import { CollectTaskLogService } from './collect-task-log.service';
import type { StartResult } from '../collect/runner';
import { CreateCollectTaskLogDTO, UpdateCollectTaskLogDTO } from './dto/collect-task-log.dto';

/** 采集记录：标准 REST + 续采 / 停止。 */
@AppCrud({
  entity: CollectTaskLogEntity,
  path: 'collect-task-log',
  dto: { create: CreateCollectTaskLogDTO, update: UpdateCollectTaskLogDTO },
})
export class CollectTaskLogController {
  constructor(public readonly service: CollectTaskLogService) {}

  /** 从断点继续采集（失败或已取消的记录都能续）。 */
  @Post('resume')
  resume(@Body() dto: IdDTO): Promise<StartResult> {
    return this.service.resume(dto.id);
  }

  /** 停止这次采集。 */
  @Post('cancel')
  cancel(@Body() dto: IdDTO): Promise<{ stopped: boolean }> {
    return this.service.cancel(dto.id);
  }
}
