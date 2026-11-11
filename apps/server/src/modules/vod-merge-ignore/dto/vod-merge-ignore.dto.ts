import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 新建VodMergeIgnore。 */
export class CreateVodMergeIgnoreDTO {
  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(64, { message: '最长 64 个字符' })
  mergeKey!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  kind?: number;
}

/** 修改VodMergeIgnore。 */
export class UpdateVodMergeIgnoreDTO {
  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(64, { message: '最长 64 个字符' })
  mergeKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  kind?: number;
}

/** 切换忽略状态入参。 */
export class ToggleDTO {
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
export class ByKeysDTO {
  @IsArray({ message: 'keys 必须是数组' })
  @ArrayNotEmpty({ message: 'keys 不能为空' })
  @IsString({ each: true, message: '分组标识必须是字符串' })
  @Matches(/^.{1,64}$/, { each: true, message: '分组标识最长 64 个字符' })
  keys!: string[];
}