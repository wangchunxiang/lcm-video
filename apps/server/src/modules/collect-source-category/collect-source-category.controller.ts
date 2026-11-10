import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { CollectSourceCategoryEntity } from './collect-source-category.entity';
import { CollectSourceCategoryService } from './collect-source-category.service';
import type { MappingSummary } from './collect-source-category.service';
import {
  CreateCollectSourceCategoryDTO,
  UpdateCollectSourceCategoryDTO,
} from './dto/collect-source-category.dto';

/** 采集源 id 入参。 */
class SourceIdDTO {
  @IsString({ message: '采集源 id 必须是数字' })
  @Matches(/^\d+$/, { message: '采集源 id 必须是数字' })
  sourceId!: string;
}

/** 批量映射入参。 */
class MapDTO {
  @IsArray({ message: 'ids 必须是数组' })
  @ArrayNotEmpty({ message: '请选择要处理的行' })
  @IsString({ each: true, message: 'id 必须是数字' })
  ids!: string[];

  @IsOptional()
  @IsString({ message: 'categoryId 必须是数字' })
  @Matches(/^\d+$/, { message: 'categoryId 必须是数字' })
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'status 必须是整数' })
  status?: number;
}

/** 重刷影片分类入参。 */
class RemapDTO extends SourceIdDTO {
  @IsString({ message: '映射 id 必须是数字' })
  @Matches(/^\d+$/, { message: '映射 id 必须是数字' })
  id!: string;

  @IsString({ message: '来源分类 id 必须是数字' })
  @Matches(/^\d+$/, { message: '来源分类 id 必须是数字' })
  fromCategoryId!: string;
}

/** 源站分类映射：标准 REST + 按源查询 / 批量映射 / 自动匹配 / 重刷影片。 */
@Crud({
  entity: CollectSourceCategoryEntity,
  path: 'api/admin/collect-source-category',
  softDelete: false,
  maxPerPage: 100,
  dto: {
    create: CreateCollectSourceCategoryDTO,
    update: UpdateCollectSourceCategoryDTO,
  },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
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
