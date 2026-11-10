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
  CollectTaskLogService,
} from './collect-task-log.service';

import {
  CollectTaskLogAllDTO,
  CollectTaskLogCreateDTO,
  CollectTaskLogDeleteDTO,
  CollectTaskLogGetDTO,
  CollectTaskLogPageDTO,
  CollectTaskLogUpdateDTO,
} from './dto/collect-task-log';

@Controller('api/admin/collect-task-log')
export class CollectTaskLogController {
  constructor(
    private readonly logs: CollectTaskLogService,
    private readonly runner: CollectRunner,
  ) {}

  @Post('create')
  create(@ZodBody(CollectTaskLogCreateDTO) dto: CollectTaskLogCreateDTO) {
    return this.logs.create(dto);
  }

  @Post('update')
  update(@ZodBody(CollectTaskLogUpdateDTO) dto: CollectTaskLogUpdateDTO) {
    return this.logs.update(dto);
  }

  @Post('delete')
  remove(@ZodBody(CollectTaskLogDeleteDTO) dto: CollectTaskLogDeleteDTO) {
    return this.logs.delete(dto);
  }

  @Post('get')
  get(@ZodBody(CollectTaskLogGetDTO) dto: CollectTaskLogGetDTO) {
    return this.logs.get(dto);
  }

  /** 断点续采：从 last_page 的下一页继续 */
  @Post('resume')
  resume(@ZodBody(z.object({ id: z.number().int().positive() })) dto: { id: number }) {
    return this.runner.startResume(dto.id);
  }

  /** 取消正在跑的这一轮 */
  @Post('cancel')
  async cancel(@ZodBody(z.object({ id: z.number().int().positive() })) dto: { id: number }) {
    const ok = await this.runner.cancel(dto.id);
    return { cancelled: ok };
  }

  @Post('page')
  page(@ZodBody(CollectTaskLogPageDTO) dto: CollectTaskLogPageDTO) {
    return this.logs.page(dto);
  }

  @Post('all')
  all(@ZodBody(CollectTaskLogAllDTO) dto: CollectTaskLogAllDTO) {
    return this.logs.all(dto);
  }
}
