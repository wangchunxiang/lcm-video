import { Column, Entity, Index, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 影片的播放线路数据。一行 = 某影片在某条线路上的全部集数。 */
@Entity('lcm_vod_play')
@Unique('uk_vod_source_from', ['vodId', 'sourceId', 'sourceFrom'])
@Index('idx_source', ['sourceId'])
@Index('idx_source_vod_vod', ['sourceId', 'sourceVodId', 'vodId'])
export class VodPlayEntity extends AppBaseEntity {
  @Column({ name: 'vod_id', type: 'bigint', unsigned: true, default: 0 })
  vodId!: string;

  /** NULL 表示手工添加的线路 */
  @Column({ name: 'source_id', type: 'bigint', unsigned: true, nullable: true })
  sourceId!: string | null;

  /** 线路标识，如 lzm3u8 */
  @Column({ name: 'source_from', type: 'varchar', length: 50, default: '' })
  sourceFrom!: string;

  /** 源站内的影片 id，用于增量比对（源站命名空间，保持字符串） */
  @Column({ name: 'source_vod_id', type: 'varchar', length: 50, default: '' })
  sourceVodId!: string;

  /** 源站给出的更新时间，用于判断是否要更新 */
  @Column({ name: 'source_updated_at', type: 'datetime', precision: 0, nullable: true })
  sourceUpdatedAt!: Date | null;

  @Column({
    name: 'collected_at',
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  collectedAt!: Date;

  /** 整串播放地址：第1集$http://...#第2集$http://... */
  @Column({ name: 'play_url', type: 'mediumtext' })
  playUrl!: string;
}
