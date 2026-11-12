import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SettingEntity } from '../setting/setting.entity';
import {
  DEFAULT_MERGE_CONFIG,
  FIXED_FIELDS,
  MERGE_FIELDS,
  STRATEGY_LABELS,
  loadMergeConfig,
  saveMergeConfig,
} from '../collect/merge';
import type { MergeConfig, MergeFieldGroup, MergeMode, MergeStrategy } from '../collect/merge';
import { MergeRuleEntity } from './vod-merge-rule.entity';
import type { UpdateVodMergeRuleDTO } from './dto/vod-merge-rule.dto';

export interface MergeRuleOptionVO {
  value: string;
  label: string;
}

export interface MergeRuleItemVO {
  key: string;
  label: string;
  /** 表格里的分组，仅用于排版 */
  group: MergeFieldGroup;
  hint: string;
  value: string;
  options: MergeRuleOptionVO[];
  /** 当前值是否等于该字段的默认策略 */
  isDefault: boolean;
}

export interface MergeRuleView {
  mode: MergeMode;
  updatedAt: string | null;
  items: MergeRuleItemVO[];
  /** 不参与合并的字段，只做说明，避免前端再抄一份常量 */
  fixed: Array<{ label: string; hint: string }>;
}

/**
 * 入库合并规则：数据库每字段一行，字段元数据（中文名、可选策略、默认值）来自
 * `collect/merge.ts` 的 `MERGE_FIELDS`，所以后台不需要再维护一份字段表。
 */
@Injectable()
export class VodMergeRuleService {
  constructor(
    @InjectRepository(MergeRuleEntity) private readonly ruleRepository: Repository<MergeRuleEntity>,
    @InjectRepository(SettingEntity) private readonly settingRepository: Repository<SettingEntity>,
  ) {}

  async get(): Promise<MergeRuleView> {
    const config = await loadMergeConfig(this.ruleRepository, this.settingRepository);
    const rows = await this.ruleRepository.find({ select: { updatedAt: true } });
    const updatedAt =
      rows.length === 0
        ? null
        : new Date(Math.max(...rows.map((row) => row.updatedAt.getTime()))).toISOString();

    return {
      mode: config.mode,
      updatedAt,
      items: MERGE_FIELDS.map((field) => {
        const value = config.fields[field.key] ?? field.strategies[0] ?? 'keep';
        return {
          key: field.key,
          label: field.label,
          group: field.group,
          hint: field.hint,
          value,
          options: field.strategies.map((strategy) => ({
            value: strategy,
            label: STRATEGY_LABELS[strategy] ?? strategy,
          })),
          isDefault: value === (field.strategies[0] ?? 'keep'),
        };
      }),
      fixed: FIXED_FIELDS,
    };
  }

  /**
   * 整份保存。以当前配置为底，只覆盖提交上来的项，未提交的字段保持原值；
   * 任何一个键或值不在白名单里都整体拒绝，避免出现半套规则。
   */
  async save(dto: UpdateVodMergeRuleDTO): Promise<{ saved: number; updatedAt: string }> {
    const current = await loadMergeConfig(this.ruleRepository, this.settingRepository);
    const config: MergeConfig = { mode: dto.mode, fields: { ...current.fields } };

    for (const item of dto.items) {
      const field = MERGE_FIELDS.find((candidate) => candidate.key === item.ruleKey);
      if (field === undefined) throw new BadRequestException(`未知的规则项：${item.ruleKey}`);
      if (!field.strategies.includes(item.ruleValue as MergeStrategy)) {
        throw new BadRequestException(`${field.label}的取值不合法：${item.ruleValue}`);
      }
      config.fields[field.key] = item.ruleValue as MergeStrategy;
    }

    await saveMergeConfig(this.ruleRepository, config);
    return { saved: MERGE_FIELDS.length + 1, updatedAt: new Date().toISOString() };
  }

  /** 只给测试/脚本用：把默认规则写回库里。 */
  async reset(): Promise<MergeConfig> {
    await saveMergeConfig(this.ruleRepository, DEFAULT_MERGE_CONFIG);
    return DEFAULT_MERGE_CONFIG;
  }
}
