import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/**
 * 全站线路注册表。是显示覆盖层（改名/排序/停用），不是 `lcm_vod_play` 的父实体：
 * `lcm_vod_play.source_from` 与它按字符串关联，未注册的线路照样显示。
 */
@Entity('lcm_play_line', { comment: '全站线路注册表：改名、排序、停用' })
@Index('uk_source_from', ['sourceFrom'], { unique: true })
@Index('idx_sort', ['sort'])
export class PlayLineEntity extends AppBaseEntity {
  @Column({
    name: 'source_from',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '线路标识，如 lzm3u8；创建后不可改（它是与 vod_play 的 join 键）',
  })
  sourceFrom!: string;

  @Column({
    name: 'source_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '供应该线路的采集源：首次登记时写入，手工维护的线路为 NULL',
  })
  sourceId!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: '',
    comment: '前台显示名，首次登记时默认填源站名，可手动修改',
  })
  name!: string;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '排序，小的在前',
  })
  sort!: number;

  @Column({
    name: 'is_enabled',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '0 停用该线路（全局，影响所有影片）',
  })
  isEnabled!: number;
}
