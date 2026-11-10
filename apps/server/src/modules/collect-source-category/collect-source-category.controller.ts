import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { CollectSourceCategoryEntity } from './collect-source-category.entity';
import { CollectSourceCategoryService } from './collect-source-category.service';
import { CreateCollectSourceCategoryDTO, UpdateCollectSourceCategoryDTO } from './dto/collect-source-category.dto';

@Crud({
  entity: CollectSourceCategoryEntity,
  path: 'api/admin/collect-source-category',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCollectSourceCategoryDTO, update: UpdateCollectSourceCategoryDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class CollectSourceCategoryController {
  constructor(public readonly service: CollectSourceCategoryService) {}
}
