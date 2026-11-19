import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IdDTO } from '../../../common/dto/id.dto';

/** 新建CollectSource。 */
export class CreateCollectSourceDTO {
  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(50, { message: '最长 50 个字符' })
  name!: string;

  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(255, { message: '最长 255 个字符' })
  apiUrl!: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(500, { message: '最长 500 个字符' })
  apiParams?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  parseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  isEnabled?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  intervalSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  pagesize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  timeout?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  retryTimes?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  lastSyncAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  lastSyncStatus?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  lastSyncMsg?: string;
}

/** 修改CollectSource。 */
export class UpdateCollectSourceDTO {
  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  name?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  apiUrl?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(500, { message: '最长 500 个字符' })
  apiParams?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  parseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  isEnabled?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  intervalSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  pagesize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  timeout?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  retryTimes?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  lastSyncAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  lastSyncStatus?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  lastSyncMsg?: string;
}

/** 采集入参：rangeType 是时间窗（1 最近24小时 / 2 最近7天 / 3 最近30天 / 4 全部）。 */
export class RunDTO extends IdDTO {
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4], { message: 'rangeType 取值 1~4' })
  rangeType?: number;
}