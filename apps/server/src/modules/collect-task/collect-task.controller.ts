import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { CollectRunner } from '../../jobs/collect/runner.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CollectTaskService } from './collect-task.service';
import {
  CollectTaskAllDTO as AllDTO,
  CollectTaskBatchDTO as BatchDTO,
  CollectTaskCreateDTO as CreateDTO,
  CollectTaskDeleteDTO as DeleteDTO,
  CollectTaskGetDTO as GetDTO,
  CollectTaskPageDTO as PageDTO,
  CollectTaskUpdateDTO as UpdateDTO,
} from './dto/collect-task';

@Controller('api/admin/collect-task')
export class CollectTaskController {
  constructor(
    private readonly tasks: CollectTaskService,
    private readonly runner: CollectRunner,
  ) {}

  @Post('create')
  create(@Body(new ZodValidationPipe(CreateDTO)) dto: CreateDTO) {
    return this.tasks.create(dto);
  }

  @Post('update')
  update(@Body(new ZodValidationPipe(UpdateDTO)) dto: UpdateDTO) {
    return this.tasks.update(dto);
  }

  @Post('delete')
  remove(@Body(new ZodValidationPipe(DeleteDTO)) dto: DeleteDTO) {
    return this.tasks.delete(dto);
  }

  @Post('get')
  get(@Body(new ZodValidationPipe(GetDTO)) dto: GetDTO) {
    return this.tasks.get(dto);
  }

  @Post('page')
  page(@Body(new ZodValidationPipe(PageDTO)) dto: PageDTO) {
    return this.tasks.page(dto);
  }

  @Post('all')
  all(@Body(new ZodValidationPipe(AllDTO)) dto: AllDTO) {
    return this.tasks.all(dto);
  }

  /** 立即执行：不受 cron 限制，跑完写一条采集记录 */
  @Post('run')
  run(@Body(new ZodValidationPipe(z.object({ id: z.number().int().positive() }))) dto: { id: number }) {
    return this.runner.startTask(dto.id, 'manual');
  }

  /** 取消正在执行的任务 */
  @Post('cancel')
  async cancel(@Body(new ZodValidationPipe(z.object({ id: z.number().int().positive() }))) dto: { id: number }) {
    const ok = await this.runner.cancelByTask(dto.id);
    return { cancelled: ok };
  }

  @Post('batch')
  batch(@Body(new ZodValidationPipe(BatchDTO)) dto: BatchDTO) {
    return this.tasks.batch(dto);
  }
}
