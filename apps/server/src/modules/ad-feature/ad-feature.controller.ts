import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { AdFeatureEntity } from './ad-feature.entity';
import { AdFeatureService } from './ad-feature.service';
import { CreateAdFeatureDTO, UpdateAdFeatureDTO } from './dto/ad-feature.dto';

@Crud({
  entity: AdFeatureEntity,
  path: 'api/admin/ad-feature',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateAdFeatureDTO, update: UpdateAdFeatureDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class AdFeatureController {
  constructor(public readonly service: AdFeatureService) {}
}
