import { Column, Entity, Index, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集源的地址替换规则，按 sort 升序依次套用。 */
@Entity('lcm_source_rule', { comment: '采集源的地址替换规则，按 sort 升序依次套用' })
@Unique('uk_source_kind_from', ['sourceId', 'kind', 'fromUrl'])
@Index('idx_source_kind', ['sourceId', 'kind'])
export class SourceRuleEntity extends AppBaseEntity {
  @Column({
    name: 'source_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '采集源 id',
  })
  sourceId!: string;

  @Column({
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 播放地址 2 图片地址',
  })
  kind!: number;

  @Column({
    name: 'from_url',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '原地址：地址中出现即替换，可省略协议',
  })
  fromUrl!: string;

  @Column({
    name: 'to_url',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '新地址：可省略协议，空表示删除这段地址',
  })
  toUrl!: string;

  @Column({
    name: 'is_enabled',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 启用 0 停用',
  })
  isEnabled!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '应用顺序，小的先套',
  })
  sort!: number;
}
