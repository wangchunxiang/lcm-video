import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 新建SourceRule。 */
export class CreateSourceRuleDTO {
  @IsString({ message: '必须是数字 id（字符串）' })
  @Matches(/^\d+$/, { message: '必须是数字 id' })
  sourceId!: string;

  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  kind!: number;

  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(255, { message: '最长 255 个字符' })
  fromUrl!: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  toUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  isEnabled?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  sort?: number;
}

/** 修改SourceRule。 */
export class UpdateSourceRuleDTO {
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
  fromUrl?: string;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  toUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  isEnabled?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  sort?: number;
}
