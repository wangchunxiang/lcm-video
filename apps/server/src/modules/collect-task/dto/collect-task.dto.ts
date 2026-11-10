import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 新建CollectTask。 */
export class CreateCollectTaskDTO {
  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(50, { message: '最长 50 个字符' })
  name!: string;

  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  rangeType?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  cron?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  isEnabled?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  lastRunAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  lastRunStatus?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  lastRunMsg?: string;
}

/** 修改CollectTask。 */
export class UpdateCollectTaskDTO {
  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  name?: string;

  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  rangeType?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  cron?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  isEnabled?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  lastRunAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  lastRunStatus?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  lastRunMsg?: string;
}
