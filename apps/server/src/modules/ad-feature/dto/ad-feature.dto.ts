import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 新建AdFeature。 */
export class CreateAdFeatureDTO {
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  kind!: number;

  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(255, { message: '最长 255 个字符' })
  durations!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  totalMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  hitVods?: number;

  @IsOptional()
  @IsArray({ message: '必须是数组' })
  sample?: unknown[];
}

/** 修改AdFeature。 */
export class UpdateAdFeatureDTO {
  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  kind?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  durations?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  totalMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  hitVods?: number;

  @IsOptional()
  @IsArray({ message: '必须是数组' })
  sample?: unknown[];
}
