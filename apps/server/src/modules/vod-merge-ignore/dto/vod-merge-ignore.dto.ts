import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
