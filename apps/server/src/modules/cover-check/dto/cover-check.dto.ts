import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 新建CoverCheck。 */
export class CreateCoverCheckDTO {
  @IsString({ message: '必须是字符串' })
  @MinLength(1, { message: '不能为空' })
  @MaxLength(255, { message: '最长 255 个字符' })
  host!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  vodCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  sampleOk?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  sampleFail?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  message?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  checkedAt?: Date;
}

/** 修改CoverCheck。 */
export class UpdateCoverCheckDTO {
  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  vodCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  status?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  sampleOk?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '必须是整数' })
  sampleFail?: number;

  @IsOptional()
  @IsString({ message: '必须是字符串' })
  @MaxLength(255, { message: '最长 255 个字符' })
  message?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: '必须是日期' })
  checkedAt?: Date;
}
