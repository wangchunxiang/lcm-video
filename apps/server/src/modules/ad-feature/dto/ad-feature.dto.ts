import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 选片时间范围：不限 / 本日 / 本周 / 本月（按作品最新更新时间算） */
export const PICK_RANGES = ['all', 'day', 'week', 'month'] as const;
export type PickRange = (typeof PICK_RANGES)[number];

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

/** 抽片请求：sourceId 必填，range 可选（不传等同不限）。 */
export class PickDTO {
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @IsOptional()
  @IsIn(PICK_RANGES, { message: '只能是 all / day / week / month' })
  range?: PickRange;
}

/** 分析请求：sourceId 必填，sample 可选（页面回传抽好的样片）。 */
export class AnalyzeDTO {
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @IsOptional()
  @IsArray({ message: '必须是数组' })
  sample?: unknown[];

  /** 没有 sample 时由服务端自己抽，按这个范围抽。 */
  @IsOptional()
  @IsIn(PICK_RANGES, { message: '只能是 all / day / week / month' })
  range?: PickRange;
}
