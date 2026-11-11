import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 分组类型：auto 严格键 / suspect 疑似 / same 同源同 source_vod_id */
export type VodMergeKind = 'auto' | 'suspect' | 'same';

export const VOD_MERGE_KINDS: VodMergeKind[] = ['auto', 'suspect', 'same'];

/** 影片 id 在 v3 里是 BIGINT 的字符串形态；前端传数字也接受，统一转成字符串。 */
const trimKey = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** 单个分组的标识。 */
export class VodMergeGroupDTO {
  @Transform(trimKey)
  @IsString({ message: '分组标识必须是字符串' })
  @MinLength(1, { message: '缺少分组标识' })
  @MaxLength(80, { message: '分组标识最长 80 个字符' })
  key!: string;

  @IsOptional()
  @IsIn(VOD_MERGE_KINDS, { message: '分组类型只能是 auto / suspect / same' })
  kind?: VodMergeKind;
}

/** 合并一组：勾选的影片 id 与可选保留项。 */
export class VodMergeMergeDTO {
  @IsArray({ message: 'ids 必须是数组' })
  @ArrayMinSize(2, { message: '请至少选择两条影片' })
  @Type(() => String)
  @Matches(/^\d+$/, { each: true, message: '影片 id 必须是正整数' })
  ids!: string[];

  @IsOptional()
  @Type(() => String)
  @Matches(/^\d+$/, { message: '保留项 id 必须是正整数' })
  keepId?: string;
}

/** 忽略 / 恢复一个分组。 */
export class VodMergeIgnoreDTO {
  @Transform(trimKey)
  @IsString({ message: '分组标识必须是字符串' })
  @MinLength(1, { message: '缺少分组标识' })
  @MaxLength(80, { message: '分组标识最长 80 个字符' })
  key!: string;

  @IsOptional()
  @IsIn(VOD_MERGE_KINDS, { message: '分组类型只能是 auto / suspect / same' })
  kind?: VodMergeKind;

  @IsOptional()
  @IsBoolean({ message: 'ignored 必须是布尔值' })
  ignored?: boolean;
}

/** 一键合并：confirm=false 只返回计划。 */
export class VodMergeBatchDTO {
  @IsOptional()
  @IsBoolean({ message: 'confirm 必须是布尔值' })
  confirm?: boolean;
}

/** batch-keys 里的一个分组标识。 */
export class VodMergeKeyItemDTO {
  @Transform(trimKey)
  @IsString({ message: '分组标识必须是字符串' })
  @MinLength(1, { message: '缺少分组标识' })
  @MaxLength(80, { message: '分组标识最长 80 个字符' })
  key!: string;

  @IsOptional()
  @IsIn(VOD_MERGE_KINDS, { message: '分组类型只能是 auto / suspect / same' })
  kind?: VodMergeKind;
}

/** 勾选若干分组批量合并或忽略。 */
export class VodMergeBatchKeysDTO {
  @IsArray({ message: 'keys 必须是数组' })
  @ArrayMinSize(1, { message: '请先选择分组' })
  @ArrayMaxSize(500, { message: '一次最多处理 500 组' })
  @ValidateNested({ each: true })
  @Type(() => VodMergeKeyItemDTO)
  keys!: VodMergeKeyItemDTO[];

  @IsOptional()
  @IsIn(['merge', 'ignore'] as const, { message: '动作只能是 merge 或 ignore' })
  action?: 'merge' | 'ignore';

  @IsOptional()
  @IsBoolean({ message: 'confirm 必须是布尔值' })
  confirm?: boolean;
}
