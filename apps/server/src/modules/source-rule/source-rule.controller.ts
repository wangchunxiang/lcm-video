import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { SourceRuleEntity } from './source-rule.entity';
import { SourceRuleService } from './source-rule.service';
import { CreateSourceRuleDTO, UpdateSourceRuleDTO } from './dto/source-rule.dto';

@Crud({
  entity: SourceRuleEntity,
  path: 'api/admin/source-rule',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateSourceRuleDTO, update: UpdateSourceRuleDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class SourceRuleController {
  constructor(public readonly service: SourceRuleService) {}
}
