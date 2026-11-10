import {
  Controller,
  Post,
} from '@nestjs/common';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  CollectTaskLogDetailService,
} from './collect-task-log-detail.service';

import {
  CollectTaskLogDetailAllDTO,
  CollectTaskLogDetailCreateDTO,
  CollectTaskLogDetailDeleteDTO,
  CollectTaskLogDetailGetDTO,
  CollectTaskLogDetailPageDTO,
  CollectTaskLogDetailUpdateDTO,
} from './dto/collect-task-log-detail';

@Controller('api/admin/collect-task-log-detail')
export class CollectTaskLogDetailController {
  constructor(private readonly details: CollectTaskLogDetailService) {}

  @Post('create')
  create(@ZodBody(CollectTaskLogDetailCreateDTO) dto: CollectTaskLogDetailCreateDTO) {
    return this.details.create(dto);
  }

  @Post('update')
  update(@ZodBody(CollectTaskLogDetailUpdateDTO) dto: CollectTaskLogDetailUpdateDTO) {
    return this.details.update(dto);
  }

  @Post('delete')
  remove(@ZodBody(CollectTaskLogDetailDeleteDTO) dto: CollectTaskLogDetailDeleteDTO) {
    return this.details.delete(dto);
  }

  @Post('get')
  get(@ZodBody(CollectTaskLogDetailGetDTO) dto: CollectTaskLogDetailGetDTO) {
    return this.details.get(dto);
  }

  @Post('page')
  page(@ZodBody(CollectTaskLogDetailPageDTO) dto: CollectTaskLogDetailPageDTO) {
    return this.details.page(dto);
  }

  @Post('all')
  all(@ZodBody(CollectTaskLogDetailAllDTO) dto: CollectTaskLogDetailAllDTO) {
    return this.details.all(dto);
  }
}
