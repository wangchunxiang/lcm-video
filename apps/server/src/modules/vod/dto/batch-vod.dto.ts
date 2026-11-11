import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';

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
