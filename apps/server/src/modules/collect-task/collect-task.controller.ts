import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { CollectTaskEntity } from './collect-task.entity';
import { CollectTaskService } from './collect-task.service';
import { CreateCollectTaskDTO, UpdateCollectTaskDTO } from './dto/collect-task.dto';

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
}
