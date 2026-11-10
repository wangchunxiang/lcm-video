import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { CoverCheckEntity } from './cover-check.entity';
import { CoverCheckService } from './cover-check.service';
import { CreateCoverCheckDTO, UpdateCoverCheckDTO } from './dto/cover-check.dto';

@Crud({
  entity: CoverCheckEntity,
  path: 'api/admin/cover-check',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCoverCheckDTO, update: UpdateCoverCheckDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class CoverCheckController {
  constructor(public readonly service: CoverCheckService) {}
}
