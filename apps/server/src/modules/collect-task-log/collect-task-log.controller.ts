import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { CollectRunner } from '../../jobs/collect/runner.js';
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
  constructor(
    private readonly logs: CollectTaskLogService,
    private readonly runner: CollectRunner,
  ) {}

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

  /** 断点续采：从 last_page 的下一页继续 */
  @Post('resume')
  resume(@Body(new ZodValidationPipe(z.object({ id: z.number().int().positive() }))) dto: { id: number }) {
    return this.runner.startResume(dto.id);
  }

  /** 取消正在跑的这一轮 */
  @Post('cancel')
  async cancel(@Body(new ZodValidationPipe(z.object({ id: z.number().int().positive() }))) dto: { id: number }) {
    const ok = await this.runner.cancel(dto.id);
    return { cancelled: ok };
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
