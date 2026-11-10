import { Controller,
  Post,
} from '@nestjs/common';

import {
  z,
} from 'zod';

import {
} from '../../common/validation/zod-validation.pipe';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  CollectRunner,
} from '../../jobs/collect/runner.js';

import {
  CollectTaskService,
} from './collect-task.service';

import {
  CollectTaskAllDTO,
  CollectTaskBatchDTO,
  CollectTaskCreateDTO,
  CollectTaskDeleteDTO,
  CollectTaskGetDTO,
  CollectTaskPageDTO,
  CollectTaskUpdateDTO,
} from './dto/collect-task';

@Controller('api/admin/collect-task')
export class CollectTaskController {
  constructor(
    private readonly tasks: CollectTaskService,
    private readonly runner: CollectRunner,
  ) {}

  @Post('create')
  create(@ZodBody(CollectTaskCreateDTO) dto: CollectTaskCreateDTO) {
    return this.tasks.create(dto);
  }

  @Post('update')
  update(@ZodBody(CollectTaskUpdateDTO) dto: CollectTaskUpdateDTO) {
    return this.tasks.update(dto);
  }

  @Post('delete')
  remove(@ZodBody(CollectTaskDeleteDTO) dto: CollectTaskDeleteDTO) {
    return this.tasks.delete(dto);
  }

  @Post('get')
  get(@ZodBody(CollectTaskGetDTO) dto: CollectTaskGetDTO) {
    return this.tasks.get(dto);
  }

  @Post('page')
  page(@ZodBody(CollectTaskPageDTO) dto: CollectTaskPageDTO) {
    return this.tasks.page(dto);
  }

  @Post('all')
  all(@ZodBody(CollectTaskAllDTO) dto: CollectTaskAllDTO) {
    return this.tasks.all(dto);
  }

  /** 立即执行：不受 cron 限制，跑完写一条采集记录 */
  @Post('run')
  run(@ZodBody(z.object({ id: z.number().int().positive() })) dto: { id: number }) {
    return this.runner.startTask(dto.id, 'manual');
  }

  /** 取消正在执行的任务 */
  @Post('cancel')
  async cancel(@ZodBody(z.object({ id: z.number().int().positive() })) dto: { id: number }) {
    const ok = await this.runner.cancelByTask(dto.id);
    return { cancelled: ok };
  }

  @Post('batch')
  batch(@ZodBody(CollectTaskBatchDTO) dto: CollectTaskBatchDTO) {
    return this.tasks.batch(dto);
  }
}
