import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { SourceIdDTO } from '../../common/dto/id.dto';
import { CollectSourceCategoryEntity } from './collect-source-category.entity';
import { CollectSourceCategoryService } from './collect-source-category.service';
import type { MappingSummary } from './collect-source-category.service';
import {
  CreateCollectSourceCategoryDTO,
  MapDTO,
  RemapDTO,
  UpdateCollectSourceCategoryDTO,
} from './dto/collect-source-category.dto';

/** 源站分类映射：标准 REST + 按源查询 / 批量映射 / 自动匹配 / 重刷影片。 */
@AppCrud({
  entity: CollectSourceCategoryEntity,
  path: 'collect-source-category',
  dto: {
    create: CreateCollectSourceCategoryDTO,
    update: UpdateCollectSourceCategoryDTO,
  },
})
export class CollectSourceCategoryController {
  constructor(public readonly service: CollectSourceCategoryService) {}

  /** 某个采集源下的全部映射与汇总。 */
  @Post('by-source')
  bySource(
    @Body() dto: SourceIdDTO,
  ): Promise<{ items: CollectSourceCategoryEntity[]; summary: MappingSummary }> {
    return this.service.bySource(dto.sourceId);
  }

  /** 批量映射到某个分类 / 标记忽略 / 取消映射。 */
  @Post('map')
  map(@Body() dto: MapDTO): Promise<{ updated: number; summary: MappingSummary }> {
    return this.service.map(dto);
  }

  /** 按分类名自动匹配未映射的行。 */
  @Post('match')
  match(@Body() dto: SourceIdDTO): Promise<{ scanned: number; matched: number }> {
    return this.service.match(dto.sourceId);
  }

  /** 把某个源站分类下的影片整体改到映射后的本站分类。 */
  @Post('remap-vods')
  remapVods(
    @Body() dto: RemapDTO,
  ): Promise<{ affected: number; from: string; to: string }> {
    return this.service.remapVods(dto);
  }
}
