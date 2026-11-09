import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CollectSourceCategoryService } from './collect-source-category.service';
import type { Page } from '../../common/page';
import type {
  CollectSourceCategoryAllDTO,
  CollectSourceCategoryBySourceDTO,
  CollectSourceCategoryCreateDTO,
  CollectSourceCategoryDeleteDTO,
  CollectSourceCategoryGetDTO,
  CollectSourceCategoryMapDTO,
  CollectSourceCategoryMatchDTO,
  CollectSourceCategoryPageDTO,
  CollectSourceCategoryRemapDTO,
  CollectSourceCategorySummaryVO,
  CollectSourceCategoryUpdateDTO,
  CollectSourceCategoryVO,
} from './dto/collect-source-category';
import {
  CollectSourceCategoryAllDTO as AllDTO,
  CollectSourceCategoryBySourceDTO as BySourceDTO,
  CollectSourceCategoryCreateDTO as CreateDTO,
  CollectSourceCategoryDeleteDTO as DeleteDTO,
  CollectSourceCategoryGetDTO as GetDTO,
  CollectSourceCategoryMapDTO as MapDTO,
  CollectSourceCategoryMatchDTO as MatchDTO,
  CollectSourceCategoryPageDTO as PageDTO,
  CollectSourceCategoryRemapDTO as RemapDTO,
  CollectSourceCategoryUpdateDTO as UpdateDTO,
} from './dto/collect-source-category';

/** 源站分类映射：标准六件套，另加 by-source / map / match / remap-vods 四个批量操作。 */
@Controller('api/admin/collect-source-category')
export class CollectSourceCategoryController {
  constructor(private readonly service: CollectSourceCategoryService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateDTO)) dto: CollectSourceCategoryCreateDTO): Promise<CollectSourceCategoryVO> {
    return this.service.create(dto);
  }

  @Post('update')
  async update(@Body(new ZodValidationPipe(UpdateDTO)) dto: CollectSourceCategoryUpdateDTO): Promise<CollectSourceCategoryVO> {
    return this.service.update(dto);
  }

  @Post('delete')
  async delete(@Body(new ZodValidationPipe(DeleteDTO)) dto: CollectSourceCategoryDeleteDTO): Promise<{ deleted: number }> {
    return this.service.delete(dto);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetDTO)) dto: CollectSourceCategoryGetDTO): Promise<CollectSourceCategoryVO> {
    return this.service.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageDTO)) dto: CollectSourceCategoryPageDTO): Promise<Page<CollectSourceCategoryVO>> {
    return this.service.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllDTO)) dto: CollectSourceCategoryAllDTO): Promise<CollectSourceCategoryVO[]> {
    return this.service.all(dto);
  }

  @Post('by-source')
  async bySource(
    @Body(new ZodValidationPipe(BySourceDTO)) dto: CollectSourceCategoryBySourceDTO,
  ): Promise<{ items: CollectSourceCategoryVO[]; summary: CollectSourceCategorySummaryVO }> {
    return this.service.bySource(dto);
  }

  @Post('map')
  async map(@Body(new ZodValidationPipe(MapDTO)) dto: CollectSourceCategoryMapDTO): Promise<{ affected: number }> {
    return this.service.map(dto);
  }

  @Post('match')
  async match(@Body(new ZodValidationPipe(MatchDTO)) dto: CollectSourceCategoryMatchDTO): Promise<{ scanned: number; matched: number }> {
    return this.service.autoMatch(dto);
  }

  @Post('remap-vods')
  async remapVods(
    @Body(new ZodValidationPipe(RemapDTO)) dto: CollectSourceCategoryRemapDTO,
  ): Promise<{ affected: number; from: number; to: number }> {
    return this.service.remapVods(dto);
  }
}
