import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** 新建线路。`sourceFrom` 是线路标识，创建后不可改（它是与 vod_play 的 join 键）。 */
export class CreatePlayLineDTO {
  @IsString({ message: '线路标识必须是字符串' })
  @MaxLength(50, { message: '线路标识最长 50 个字符' })
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: '线路标识只能包含字母、数字、下划线和减号' })
  sourceFrom!: string;

  @IsOptional()
  @IsString({ message: '线路名称必须是字符串' })
  @MaxLength(50, { message: '线路名称最长 50 个字符' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序值必须是整数' })
  @Min(0, { message: '排序值不能小于 0' })
  sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '启用状态只能是 0 或 1' })
  isEnabled?: number;
}

/** 修改线路。除 `sourceFrom` 外的字段都可选。 */
export class UpdatePlayLineDTO {
  @IsOptional()
  @IsString({ message: '线路名称必须是字符串' })
  @MaxLength(50, { message: '线路名称最长 50 个字符' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序值必须是整数' })
  @Min(0, { message: '排序值不能小于 0' })
  sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '启用状态只能是 0 或 1' })
  isEnabled?: number;
}

/** 拖拽排序：按传入顺序把 sort 重排为 10、20、30… */
export class SortPlayLineDTO {
  @IsArray({ message: '线路 id 必须是数组' })
  @ArrayMinSize(1, { message: '没有要排序的线路' })
  @IsString({ each: true, message: '线路 id 必须是字符串' })
  ids!: string[];
}

/** 批量启停。 */
export class SwitchPlayLineDTO {
  @IsArray({ message: '线路 id 必须是数组' })
  @ArrayMinSize(1, { message: '没有要修改的线路' })
  @IsString({ each: true, message: '线路 id 必须是字符串' })
  ids!: string[];

  @Type(() => Number)
  @IsIn([0, 1], { message: '启用状态只能是 0 或 1' })
  isEnabled!: number;
}
