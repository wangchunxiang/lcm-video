import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Page } from '../../common/page';
import { CollectRunner } from '../../jobs/collect/runner.js';
import { CollectSourceService } from './collect-source.service';
import type {
  CollectSourceAllDTO,
  CollectSourceBatchDTO,
  CollectSourceCreateDTO,
  CollectSourceDeleteDTO,
  CollectSourceGetDTO,
  CollectSourcePageDTO,
  CollectSourceUpdateDTO,
  CollectSourceVO,
} from './dto/collect-source';
import {
  CollectSourceAllDTO as AllSchema,
  CollectSourceBatchDTO as BatchSchema,
  CollectSourceCreateDTO as CreateSchema,
  CollectSourceDeleteDTO as DeleteSchema,
  CollectSourceGetDTO as GetSchema,
  CollectSourcePageDTO as PageSchema,
  CollectSourceUpdateDTO as UpdateSchema,
} from './dto/collect-source';

/**
 * 采集源表：标准六件套 + batch（批量启停）。
 * 「测试连通性 / 获取分类 / 立即采集」要依赖采集引擎，随 jobs/collect 一起接。
 */
@Controller('api/admin/collect-source')
export class CollectSourceController {
  constructor(
    private readonly collectSourceService: CollectSourceService,
    private readonly runner: CollectRunner,
  ) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateSchema)) dto: CollectSourceCreateDTO): Promise<CollectSourceVO> {
    return this.collectSourceService.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateSchema)) dto: CollectSourceUpdateDTO): Promise<CollectSourceVO> {
    return this.collectSourceService.update(dto);
  }

  @Post('delete')
  async delete(
    @Body(new ZodValidationPipe(DeleteSchema)) dto: CollectSourceDeleteDTO,
  ): Promise<{ deleted: number; lines: number; emptyVods: number }> {
    return this.collectSourceService.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: CollectSourceGetDTO): Promise<CollectSourceVO> {
    return this.collectSourceService.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageSchema)) dto: CollectSourcePageDTO): Promise<Page<CollectSourceVO>> {
    return this.collectSourceService.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllSchema)) dto: CollectSourceAllDTO): Promise<CollectSourceVO[]> {
    return this.collectSourceService.all(dto);
  }

  /** 手动采集：立即跑一次，不需要建任务 */
  @Post('run')
  run(
    @Body(new ZodValidationPipe(z.object({ id: z.number().int().positive(), confirmEmpty: z.boolean().optional() })))
    dto: { id: number; confirmEmpty?: boolean },
  ) {
    return this.runner.startSourceRun(dto.id, { confirmEmpty: dto.confirmEmpty ?? false });
  }

  @Post('batch')
  async batch(@Body(new ZodValidationPipe(BatchSchema)) dto: CollectSourceBatchDTO): Promise<{ affected: number }> {
    return this.collectSourceService.batch(dto);
  }
}
