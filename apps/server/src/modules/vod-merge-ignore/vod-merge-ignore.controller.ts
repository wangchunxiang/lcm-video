import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VodMergeIgnoreEntity } from './vod-merge-ignore.entity';
import { VodMergeIgnoreService } from './vod-merge-ignore.service';
import {
  CreateVodMergeIgnoreDTO,
  UpdateVodMergeIgnoreDTO,
} from './dto/vod-merge-ignore.dto';

/** 切换忽略状态入参。 */
class ToggleDTO {
  @IsString({ message: '分组标识必须是字符串' })
  @MinLength(1, { message: '分组标识不能为空' })
  @MaxLength(64, { message: '分组标识最长 64 个字符' })
  mergeKey!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '分组类型必须是整数' })
  kind?: number;

  @IsBoolean({ message: 'ignored 必须是布尔值' })
  ignored!: boolean;
}

/** 批量查询入参。 */
class ByKeysDTO {
  @IsArray({ message: 'keys 必须是数组' })
  @ArrayNotEmpty({ message: 'keys 不能为空' })
  @IsString({ each: true, message: '分组标识必须是字符串' })
  @Matches(/^.{1,64}$/, { each: true, message: '分组标识最长 64 个字符' })
  keys!: string[];
}

/** 重复影片忽略名单：标准 REST + 幂等开关 + 批量查询。 */
@Crud({
  entity: VodMergeIgnoreEntity,
  path: 'api/admin/vod-merge-ignore',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateVodMergeIgnoreDTO, update: UpdateVodMergeIgnoreDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
})
export class VodMergeIgnoreController {
  constructor(public readonly service: VodMergeIgnoreService) {}

  /** 幂等切换忽略状态。 */
  @Post('toggle')
  toggle(@Body() dto: ToggleDTO): Promise<{ ignored: boolean; id: string }> {
    return this.service.toggle(dto.mergeKey, dto.kind ?? 1, dto.ignored);
  }

  /** 批量查哪些分组已在忽略名单里。 */
  @Post('by-keys')
  byKeys(@Body() dto: ByKeysDTO): Promise<{ keys: string[] }> {
    return this.service.byKeys(dto.keys);
  }
}
