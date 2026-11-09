import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CollectTaskLogService } from './collect-task-log.service';
import {
  CollectTaskLogAllDTO as AllDTO,
  CollectTaskLogCreateDTO as CreateDTO,
  CollectTaskLogDeleteDTO as DeleteDTO,
  CollectTaskLogGetDTO as GetDTO,
  CollectTaskLogPageDTO as PageDTO,
  CollectTaskLogUpdateDTO as UpdateDTO,
} from './dto/collect-task-log';

@Controller('api/admin/collect-task-log')
export class CollectTaskLogController {
  constructor(private readonly logs: CollectTaskLogService) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.logs.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.logs.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.logs.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.logs.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.logs.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.logs.all(dto);
  }
}
