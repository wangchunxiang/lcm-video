import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 修改影片：所有字段可选，传了才改。 */
export class UpdateVodDTO {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: '分类必须是数字 id' })
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: '片名不能为空' })
  @MaxLength(255, { message: '片名最长 255 个字符' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  director?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  writer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  intro?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  releaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  episodeCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lang?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态只能是 0 或 1' })
  status?: number;
}
