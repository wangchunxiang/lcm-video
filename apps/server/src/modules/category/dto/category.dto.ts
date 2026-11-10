import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 新建分类。 */
export class CreateCategoryDTO {
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+$/, { message: '父分类必须是数字 id' })
  pid?: string;

  @IsString({ message: '分类名必须是字符串' })
  @MinLength(1, { message: '分类名不能为空' })
  @MaxLength(50, { message: '分类名最长 50 个字符' })
  name!: string;

  @IsString({ message: '别名必须是字符串' })
  @Matches(/^[a-z0-9-]+$/, { message: '别名只能包含小写字母、数字和减号' })
  @MaxLength(50, { message: '别名最长 50 个字符' })
  alias!: string;

  @IsOptional()
  @IsString({ message: '匹配名必须是字符串' })
  @MaxLength(255, { message: '匹配名最长 255 个字符' })
  matchNames?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '显示状态只能是 0 或 1' })
  isShow?: number;
}

/** 修改分类。 */
export class UpdateCategoryDTO {
  @IsOptional()
  @IsString({ message: '分类名必须是字符串' })
  @MinLength(1, { message: '分类名不能为空' })
  @MaxLength(50, { message: '分类名最长 50 个字符' })
  name?: string;

  @IsOptional()
  @IsString({ message: '别名必须是字符串' })
  @Matches(/^[a-z0-9-]+$/, { message: '别名只能包含小写字母、数字和减号' })
  @MaxLength(50, { message: '别名最长 50 个字符' })
  alias?: string;

  @IsOptional()
  @IsString({ message: '匹配名必须是字符串' })
  @MaxLength(255, { message: '匹配名最长 255 个字符' })
  matchNames?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '显示状态只能是 0 或 1' })
  isShow?: number;

  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+$/, { message: '父分类必须是数字 id' })
  pid?: string;
}
