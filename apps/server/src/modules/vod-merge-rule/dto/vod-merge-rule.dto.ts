import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import type { MergeMode } from '../../collect/merge';

/** 一条规则：`ruleKey` 是字段名或 mode，`ruleValue` 是策略标识。 */
export class MergeRuleItemDTO {
  @IsString({ message: '规则项必须是字符串' })
  @IsNotEmpty({ message: '规则项不能为空' })
  ruleKey!: string;

  @IsString({ message: '规则取值必须是字符串' })
  @IsNotEmpty({ message: '规则取值不能为空' })
  ruleValue!: string;
}

/** 整份规则一次性提交（设置页只有一个保存按钮）。 */
export class UpdateVodMergeRuleDTO {
  @IsIn(['merge', 'off'], { message: '合并模式取值不合法' })
  mode!: MergeMode;

  @IsArray({ message: '规则列表格式不正确' })
  @ValidateNested({ each: true })
  @Type(() => MergeRuleItemDTO)
  items!: MergeRuleItemDTO[];
}
