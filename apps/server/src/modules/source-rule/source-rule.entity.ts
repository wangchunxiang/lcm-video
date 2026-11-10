import { Column, Entity, Index, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集源的地址替换规则，按 sort 升序依次套用。 */
@Entity('lcm_source_rule')
@Unique('uk_source_kind_from', ['sourceId', 'kind', 'fromUrl'])
@Index('idx_source_kind', ['sourceId', 'kind'])
export class SourceRuleEntity extends AppBaseEntity {
  @Column({ name: 'source_id', type: 'bigint', unsigned: true, default: 0 })
  sourceId!: string;

  /** 1 播放地址 2 图片地址 */
  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  kind!: number;

  /** 源地址前缀 */
  @Column({ name: 'from_url', type: 'varchar', length: 255, default: '' })
  fromUrl!: string;

  /** 替换成的前缀，空表示删除该前缀 */
  @Column({ name: 'to_url', type: 'varchar', length: 255, default: '' })
  toUrl!: string;

  @Column({ name: 'is_enabled', type: 'tinyint', unsigned: true, default: 1 })
  isEnabled!: number;

  /** 应用顺序，小的先套 */
  @Column({ type: 'int', unsigned: true, default: 0 })
  sort!: number;
}
