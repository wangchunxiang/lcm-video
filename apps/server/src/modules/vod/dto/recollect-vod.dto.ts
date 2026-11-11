import { IsOptional, IsString, Matches } from 'class-validator';

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
