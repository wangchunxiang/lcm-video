import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { CollectSourceEntity } from './collect-source.entity';
import { CollectSourceService } from './collect-source.service';
import { CreateCollectSourceDTO, UpdateCollectSourceDTO } from './dto/collect-source.dto';

@Crud({
  entity: CollectSourceEntity,
  path: 'api/admin/collect-source',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCollectSourceDTO, update: UpdateCollectSourceDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class CollectSourceController {
  constructor(public readonly service: CollectSourceService) {}
}
