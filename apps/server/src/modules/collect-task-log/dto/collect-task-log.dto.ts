import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** 新建CollectTaskLog。 */
export class CreateCollectTaskLogDTO {
  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  taskId?: string;

  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  taskName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  rangeType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  totalPages?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  lastPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  resumeCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  interruptedMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  inserted?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  updated?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  skipped?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  ignored?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  failed?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(500, { message: '最长 500 个字符' })
  message?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  startedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  finishedAt?: Date;
}

/** 修改CollectTaskLog。 */
export class UpdateCollectTaskLogDTO {
  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  taskId?: string;

  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  taskName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  rangeType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  totalPages?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  lastPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  resumeCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  interruptedMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  inserted?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  updated?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  skipped?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  ignored?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  failed?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(500, { message: '最长 500 个字符' })
  message?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  startedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  finishedAt?: Date;
}
