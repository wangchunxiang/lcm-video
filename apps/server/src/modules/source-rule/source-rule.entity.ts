import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/**
 * 采集源的地址替换规则，按 sort 升序依次套用。
 *
 * `from_url` 存多条原地址（一行一条，共用同一个 `to_url`）：源站反复换域名时，把历史上
 * 的老域名都写进同一条规则，重刷一次就全部指向新域名。因为是多值文本，原来按
 * (source_id, kind, from_url) 建的唯一索引改成由服务层做「同一原地址不能出现在两条规则里」的校验，
 * 详见 `SourceRuleService.assertNoOverlap`。
 */
@Entity('lcm_source_rule', { comment: '采集源的地址替换规则，按 sort 升序依次套用' })
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
    type: 'text',
    comment: '原地址（可多条，一行一条）：地址中出现即替换，可省略协议',
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
