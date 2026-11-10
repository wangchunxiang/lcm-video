import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { CollectTaskLogEntity } from './collect-task-log.entity';
import { CollectTaskLogService } from './collect-task-log.service';
import { CreateCollectTaskLogDTO, UpdateCollectTaskLogDTO } from './dto/collect-task-log.dto';

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
}
