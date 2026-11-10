import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { VodMergeIgnoreEntity } from './vod-merge-ignore.entity';
import { VodMergeIgnoreService } from './vod-merge-ignore.service';
import { CreateVodMergeIgnoreDTO, UpdateVodMergeIgnoreDTO } from './dto/vod-merge-ignore.dto';

@Crud({
  entity: VodMergeIgnoreEntity,
  path: 'api/admin/vod-merge-ignore',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateVodMergeIgnoreDTO, update: UpdateVodMergeIgnoreDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class VodMergeIgnoreController {
  constructor(public readonly service: VodMergeIgnoreService) {}
}
