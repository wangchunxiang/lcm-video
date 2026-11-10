import { Controller,
  Post,
} from '@nestjs/common';

import {
  z,
} from 'zod';

import {
} from '../../common/validation/zod-validation.pipe';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import type {
  Page,
} from '../../common/pagination/page';

import {
  CollectRunner,
} from '../../jobs/collect/runner.js';

import {
  CollectSourceService,
} from './collect-source.service';

import {
  CollectSourceAllDTO,
  CollectSourceBatchDTO,
  CollectSourceCreateDTO,
  CollectSourceDeleteDTO,
  CollectSourceGetDTO,
  CollectSourcePageDTO,
  CollectSourceRunDTO,
  CollectSourceUpdateDTO,
  type CollectSourceVO,
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
  async create(@ZodBody(CollectSourceCreateDTO) dto: CollectSourceCreateDTO): Promise<CollectSourceVO> {
    return this.collectSourceService.create(dto);
  }

  @Post('update')
  async update(@ZodBody(CollectSourceUpdateDTO) dto: CollectSourceUpdateDTO): Promise<CollectSourceVO> {
    return this.collectSourceService.update(dto);
  }

  @Post('delete')
  async delete(
    @ZodBody(CollectSourceDeleteDTO) dto: CollectSourceDeleteDTO,
  ): Promise<{ deleted: number; lines: number; emptyVods: number }> {
    return this.collectSourceService.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(CollectSourceGetDTO) dto: CollectSourceGetDTO): Promise<CollectSourceVO> {
    return this.collectSourceService.get(dto);
  }

  @Post('page')
  async page(@ZodBody(CollectSourcePageDTO) dto: CollectSourcePageDTO): Promise<Page<CollectSourceVO>> {
    return this.collectSourceService.page(dto);
  }

  @Post('all')
  async all(@ZodBody(CollectSourceAllDTO) dto: CollectSourceAllDTO): Promise<CollectSourceVO[]> {
    return this.collectSourceService.all(dto);
  }

  /** 手动采集：立即跑一次，不需要建任务 */
  @Post('run')
  run(
    @ZodBody(z.object({ id: z.number().int().positive(), confirmEmpty: z.boolean().optional() }))
    dto: { id: number; confirmEmpty?: boolean },
  ) {
    return this.runner.startSourceRun(dto.id, { confirmEmpty: dto.confirmEmpty ?? false });
  }

  /** 测试连通性：拉一次源站分类，不落库 */
  @Post('test')
  test(@ZodBody(CollectSourceRunDTO) dto: CollectSourceRunDTO) {
    return this.collectSourceService.test(dto);
  }

  /** 拉取源站分类并写入映射表，未映射的顺手自动匹配 */
  @Post('fetch-categories')
  fetchCategories(@ZodBody(CollectSourceRunDTO) dto: CollectSourceRunDTO) {
    return this.collectSourceService.fetchCategories(dto);
  }

  @Post('batch')
  async batch(@ZodBody(CollectSourceBatchDTO) dto: CollectSourceBatchDTO): Promise<{ affected: number }> {
    return this.collectSourceService.batch(dto);
  }
}
