import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CollectTaskLogDetailService } from './collect-task-log-detail.service';
import {
  CollectTaskLogDetailAllDTO as AllDTO,
  CollectTaskLogDetailCreateDTO as CreateDTO,
  CollectTaskLogDetailDeleteDTO as DeleteDTO,
  CollectTaskLogDetailGetDTO as GetDTO,
  CollectTaskLogDetailPageDTO as PageDTO,
  CollectTaskLogDetailUpdateDTO as UpdateDTO,
} from './dto/collect-task-log-detail';

@Controller('api/admin/collect-task-log-detail')
export class CollectTaskLogDetailController {
  constructor(private readonly details: CollectTaskLogDetailService) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.details.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.details.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.details.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.details.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.details.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.details.all(dto);
  }
}
