import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 新建影片。 */
export class CreateVodDTO {
  @IsString({ message: '分类必须是数字 id' })
  @Matches(/^\d+$/, { message: '分类必须是数字 id' })
  categoryId!: string;

  @IsString({ message: '片名必须是字符串' })
  @MinLength(1, { message: '片名不能为空' })
  @MaxLength(255, { message: '片名最长 255 个字符' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '别名最长 500 个字符' })
  subName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: '封面地址最长 1000 个字符' })
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: '演员最长 1000 个字符' })
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '导演最长 500 个字符' })
  director?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '编剧最长 500 个字符' })
  writer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: '简介最长 1000 个字符' })
  intro?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '上映日期最长 255 个字符' })
  releaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '集数必须是整数' })
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
  @IsInt({ message: '年份必须是整数' })
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态只能是 0 或 1' })
  status?: number;
}

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
  @MaxLength(255)
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

/** 批量改分类 / 上下架。 */
export class BatchVodDTO {
  @IsArray({ message: 'ids 必须是数组' })
  @IsString({ each: true, message: 'ids 必须是字符串数组' })
  ids!: string[];

  @IsIn(['status', 'category'], { message: 'action 只能是 status 或 category' })
  action!: 'status' | 'category';

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态只能是 0 或 1' })
  status?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: '分类必须是数字 id' })
  categoryId?: string;
}

/** 重新采集单片入参。 */
export class RecollectDTO {
  @IsString({ message: '影片 id 必须是数字' })
  @Matches(/^\d+$/, { message: '影片 id 必须是数字' })
  id!: string;

  @IsOptional()
  @IsString({ message: '采集源 id 必须是数字' })
  @Matches(/^\d+$/, { message: '采集源 id 必须是数字' })
  sourceId?: string;
}
