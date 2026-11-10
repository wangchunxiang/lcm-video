import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/**
 * 全站线路注册表。是显示覆盖层（改名/排序/停用），不是 `lcm_vod_play` 的父实体：
 * `lcm_vod_play.source_from` 与它按字符串关联，未注册的线路照样显示。
 */
@Entity('lcm_play_line')
@Index('uk_source_from', ['sourceFrom'], { unique: true })
@Index('idx_sort', ['sort'])
export class PlayLineEntity extends AppBaseEntity {
  /** 线路标识，如 lzm3u8；创建后不可改（它是与 vod_play 的 join 键） */
  @Column({ name: 'source_from', type: 'varchar', length: 50, default: '' })
  sourceFrom!: string;

  /** 前台显示名，空则回退到采集源名 */
  @Column({ type: 'varchar', length: 50, default: '' })
  name!: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sort!: number;

  /** 0 停用该线路（全局，影响所有影片） */
  @Column({ name: 'is_enabled', type: 'tinyint', unsigned: true, default: 1 })
  isEnabled!: number;
}
