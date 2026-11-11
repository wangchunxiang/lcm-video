import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SourceIdDTO } from '../../../common/dto/id.dto';

/** 新建CollectSourceCategory。 */
export class CreateCollectSourceCategoryDTO {
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(50, { message: '最长 50 个字符' })
  sourceTypeId!: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(100, { message: '最长 100 个字符' })
  sourceTypeName?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  sourceTypePid?: string;

  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  matchType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  status?: number;
}

/** 修改CollectSourceCategory。 */
export class UpdateCollectSourceCategoryDTO {
  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  sourceTypeId?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(100, { message: '最长 100 个字符' })
  sourceTypeName?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(50, { message: '最长 50 个字符' })
  sourceTypePid?: string;

  @IsOptional()
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  matchType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  status?: number;
}

/** 批量映射入参。 */
export class MapDTO {
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
export class RemapDTO extends SourceIdDTO {
  @IsString({ message: '映射 id 必须是数字' })
  @Matches(/^\d+$/, { message: '映射 id 必须是数字' })
  id!: string;

  @IsString({ message: '来源分类 id 必须是数字' })
  @Matches(/^\d+$/, { message: '来源分类 id 必须是数字' })
  fromCategoryId!: string;
}