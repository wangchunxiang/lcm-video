import {
  Controller,
  Post,
} from '@nestjs/common';

import type {
  Page,
} from '../../common/pagination/page';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import {
  CollectSourceCategoryService,
} from './collect-source-category.service';

import {
  CollectSourceCategoryAllDTO,
  CollectSourceCategoryBySourceDTO,
  CollectSourceCategoryCreateDTO,
  CollectSourceCategoryDeleteDTO,
  CollectSourceCategoryGetDTO,
  CollectSourceCategoryMapDTO,
  CollectSourceCategoryMatchDTO,
  CollectSourceCategoryPageDTO,
  CollectSourceCategoryRemapDTO,
  CollectSourceCategoryUpdateDTO,
} from './dto/collect-source-category';

import type {
  CollectSourceCategorySummaryVO,
  CollectSourceCategoryVO,
} from './dto/collect-source-category';

/** 源站分类映射：标准六件套，另加 by-source / map / match / remap-vods 四个批量操作。 */
@Controller('api/admin/collect-source-category')
export class CollectSourceCategoryController {
  constructor(private readonly service: CollectSourceCategoryService) {}

  @Post('create')
  async create(@ZodBody(CollectSourceCategoryCreateDTO) dto: CollectSourceCategoryCreateDTO): Promise<CollectSourceCategoryVO> {
    return this.service.create(dto);
  }

  @Post('update')
  async update(@ZodBody(CollectSourceCategoryUpdateDTO) dto: CollectSourceCategoryUpdateDTO): Promise<CollectSourceCategoryVO> {
    return this.service.update(dto);
  }

  @Post('delete')
  async delete(@ZodBody(CollectSourceCategoryDeleteDTO) dto: CollectSourceCategoryDeleteDTO): Promise<{ deleted: number }> {
    return this.service.delete(dto);
  }

  @Post('get')
  async get(@ZodBody(CollectSourceCategoryGetDTO) dto: CollectSourceCategoryGetDTO): Promise<CollectSourceCategoryVO> {
    return this.service.get(dto);
  }

  @Post('page')
  async page(@ZodBody(CollectSourceCategoryPageDTO) dto: CollectSourceCategoryPageDTO): Promise<Page<CollectSourceCategoryVO>> {
    return this.service.page(dto);
  }

  @Post('all')
  async all(@ZodBody(CollectSourceCategoryAllDTO) dto: CollectSourceCategoryAllDTO): Promise<CollectSourceCategoryVO[]> {
    return this.service.all(dto);
  }

  @Post('by-source')
  async bySource(
    @ZodBody(CollectSourceCategoryBySourceDTO) dto: CollectSourceCategoryBySourceDTO,
  ): Promise<{ items: CollectSourceCategoryVO[]; summary: CollectSourceCategorySummaryVO }> {
    return this.service.bySource(dto);
  }

  @Post('map')
  async map(@ZodBody(CollectSourceCategoryMapDTO) dto: CollectSourceCategoryMapDTO): Promise<{ affected: number }> {
    return this.service.map(dto);
  }

  @Post('match')
  async match(@ZodBody(CollectSourceCategoryMatchDTO) dto: CollectSourceCategoryMatchDTO): Promise<{ scanned: number; matched: number }> {
    return this.service.autoMatch(dto);
  }

  @Post('remap-vods')
  async remapVods(
    @ZodBody(CollectSourceCategoryRemapDTO) dto: CollectSourceCategoryRemapDTO,
  ): Promise<{ affected: number; from: number; to: number }> {
    return this.service.remapVods(dto);
  }
}
