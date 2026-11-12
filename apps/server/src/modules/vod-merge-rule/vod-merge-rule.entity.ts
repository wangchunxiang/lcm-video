import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/**
 * 入库合并规则：一个字段一行。
 *
 * 以前整份规则是 `lcm_setting` 里 `merge_rules` 的一条 JSON，解析失败只能整包回落默认值，
 * 也看不出是哪一项坏了。拆成行之后，字段的元数据（中文名、可选策略、默认值）仍然由
 * `collect/merge.ts` 的 `MERGE_FIELDS` 定义，本表只存「这个键选了哪个策略」。
 *
 * `rule_key = 'mode'` 是整表开关（merge / off），其余键与 `lcm_vod` 字段同名。
 */
@Entity('lcm_vod_merge_rule', { comment: '影片入库合并规则：每个字段一行' })
@Index('uk_rule_key', ['ruleKey'], { unique: true })
export class MergeRuleEntity extends AppBaseEntity {
  @Column({
    name: 'rule_key',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '规则键：mode 或 lcm_vod 字段名',
  })
  ruleKey!: string;

  @Column({
    name: 'rule_value',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '策略标识，取值由 merge.ts 的白名单校验',
  })
  ruleValue!: string;
}
