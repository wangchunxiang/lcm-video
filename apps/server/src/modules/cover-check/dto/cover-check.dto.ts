import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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

/** 域名入参。 */
export class HostDTO {
  @IsString({ message: '域名必须是字符串' })
  @MinLength(1, { message: '域名不能为空' })
  @MaxLength(255, { message: '域名最长 255 个字符' })
  host!: string;
}

/** 修复入参：limit 控制一次处理多少部。 */
export class RepairDTO extends HostDTO {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 最小 1' })
  @Max(500, { message: 'limit 最大 500' })
  limit?: number;
}

/** 域名下的影片分页入参。 */
export class HostVodsDTO extends HostDTO {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'take 必须是整数' })
  @Min(1, { message: 'take 最小 1' })
  @Max(100, { message: 'take 最大 100' })
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'skip 必须是整数' })
  @Min(0, { message: 'skip 不能为负' })
  skip?: number;
}