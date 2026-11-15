import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * 新建轮播位。
 *
 * 覆盖字段（`title` / `subTitle` / `bgImage` / `remarks`）都是可选的，
 * 不传或传空串就等于「用影片自己的值」。
 */
export class CreateHomeHeroDTO {
  @Type(() => String)
  @Matches(/^\d+$/, { message: '影片 id 必须是数字' })
  vodId!: string;

  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  @MaxLength(255, { message: '标题最长 255 个字符' })
  title?: string;

  @IsOptional()
  @IsString({ message: '副标题必须是字符串' })
  @MaxLength(255, { message: '副标题最长 255 个字符' })
  subTitle?: string;

  @IsOptional()
  @IsString({ message: '横幅图地址必须是字符串' })
  @MaxLength(1000, { message: '横幅图地址最长 1000 个字符' })
  bgImage?: string;

  @IsOptional()
  @IsString({ message: '角标必须是字符串' })
  @MaxLength(255, { message: '角标最长 255 个字符' })
  remarks?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '显示状态只能是 0 或 1' })
  isShow?: number;

  @IsOptional()
  @IsDateString({}, { message: '上线时间格式不正确' })
  startAt?: string | null;

  @IsOptional()
  @IsDateString({}, { message: '下线时间格式不正确' })
  endAt?: string | null;
}

/** 修改轮播位：所有字段可选，只改传了的那些。 */
export class UpdateHomeHeroDTO {
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+$/, { message: '影片 id 必须是数字' })
  vodId?: string;

  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  @MaxLength(255, { message: '标题最长 255 个字符' })
  title?: string;

  @IsOptional()
  @IsString({ message: '副标题必须是字符串' })
  @MaxLength(255, { message: '副标题最长 255 个字符' })
  subTitle?: string;

  @IsOptional()
  @IsString({ message: '横幅图地址必须是字符串' })
  @MaxLength(1000, { message: '横幅图地址最长 1000 个字符' })
  bgImage?: string;

  @IsOptional()
  @IsString({ message: '角标必须是字符串' })
  @MaxLength(255, { message: '角标最长 255 个字符' })
  remarks?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '显示状态只能是 0 或 1' })
  isShow?: number;

  @IsOptional()
  @IsDateString({}, { message: '上线时间格式不正确' })
  startAt?: string | null;

  @IsOptional()
  @IsDateString({}, { message: '下线时间格式不正确' })
  endAt?: string | null;
}

/** 后台表格查询：关键词匹配片名或覆盖标题，status 0 隐藏 / 1 显示，空表示全部 */
export class HomeHeroRowsDTO {
  @IsOptional()
  @IsString({ message: '关键词必须是字符串' })
  @MaxLength(255, { message: '关键词最长 255 个字符' })
  keyword?: string;

  @IsOptional()
  @Type(() => String)
  @IsIn(['', '0', '1'], { message: '显示状态只能是 0 或 1' })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '每页条数必须是整数' })
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '偏移量必须是整数' })
  skip?: number;
}
