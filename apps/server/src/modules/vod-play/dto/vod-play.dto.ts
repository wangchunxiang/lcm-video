import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 新增线路（手工）。 */
export class CreateVodPlayDTO {
  @IsString({ message: '影片 id 必须是数字' })
  @Matches(/^\d+$/, { message: '影片 id 必须是数字' })
  vodId!: string;

  @IsString({ message: '线路标识必须是字符串' })
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: '线路标识只能包含字母、数字、下划线和减号' })
  @MaxLength(50, { message: '线路标识最长 50 个字符' })
  sourceFrom!: string;

  @IsString({ message: '播放地址必须是字符串' })
  @MinLength(1, { message: '至少填一集播放地址' })
  playUrl!: string;
}

/** 修改线路：采集来的线路不能改名。 */
export class UpdateVodPlayDTO {
  @IsOptional()
  @IsString({ message: '线路标识必须是字符串' })
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: '线路标识只能包含字母、数字、下划线和减号' })
  @MaxLength(50)
  sourceFrom?: string;

  @IsOptional()
  @IsString({ message: '播放地址必须是字符串' })
  @MinLength(1, { message: '至少填一集播放地址' })
  playUrl?: string;
}

/** 删除线路：删掉某影片最后一条线路时需要 force。 */
export class DeleteVodPlayDTO {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'force 必须是布尔值' })
  force?: boolean;
}

/** 按影片取线路。 */
export class ByVodDTO {
  @IsString({ message: '影片 id 必须是数字' })
  @Matches(/^\d+$/, { message: '影片 id 必须是数字' })
  vodId!: string;
}

/** 批量删除。 */
export class DeleteManyVodPlayDTO {
  @IsArray({ message: 'ids 必须是数组' })
  @IsString({ each: true, message: 'ids 必须是字符串数组' })
  ids!: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'force 必须是布尔值' })
  force?: boolean;
}
