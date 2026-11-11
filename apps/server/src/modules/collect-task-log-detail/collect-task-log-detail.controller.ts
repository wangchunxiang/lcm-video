import { AppCrud } from '../../common/crud/app-crud.decorator';
import { CollectTaskLogDetailEntity } from './collect-task-log-detail.entity';
import { CollectTaskLogDetailService } from './collect-task-log-detail.service';
import { CreateCollectTaskLogDetailDTO, UpdateCollectTaskLogDetailDTO } from './dto/collect-task-log-detail.dto';

@AppCrud({
  entity: CollectTaskLogDetailEntity,
  path: 'api/admin/collect-task-log-detail',
  dto: { create: CreateCollectTaskLogDetailDTO, update: UpdateCollectTaskLogDetailDTO },
})
export class CollectTaskLogDetailController {
  constructor(public readonly service: CollectTaskLogDetailService) {}
}
