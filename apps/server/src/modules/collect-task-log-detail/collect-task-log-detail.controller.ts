import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { CollectTaskLogDetailEntity } from './collect-task-log-detail.entity';
import { CollectTaskLogDetailService } from './collect-task-log-detail.service';
import { CreateCollectTaskLogDetailDTO, UpdateCollectTaskLogDetailDTO } from './dto/collect-task-log-detail.dto';

@Crud({
  entity: CollectTaskLogDetailEntity,
  path: 'api/admin/collect-task-log-detail',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCollectTaskLogDetailDTO, update: UpdateCollectTaskLogDetailDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class CollectTaskLogDetailController {
  constructor(public readonly service: CollectTaskLogDetailService) {}
}
