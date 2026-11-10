import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** 新建CollectTaskLogDetail。 */
export class CreateCollectTaskLogDetailDTO {
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  logId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  page?: number;

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
  @IsObject({ message: '必须是对象' })
  failDetail?: Record<string, unknown>;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(500, { message: '最长 500 个字符' })
  message?: string;
}

/** 修改CollectTaskLogDetail。 */
export class UpdateCollectTaskLogDetailDTO {
  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  logId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  page?: number;

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
  @IsObject({ message: '必须是对象' })
  failDetail?: Record<string, unknown>;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(500, { message: '最长 500 个字符' })
  message?: string;
}
