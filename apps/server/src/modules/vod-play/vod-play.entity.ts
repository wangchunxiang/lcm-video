import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 影片的播放线路数据。一行 = 某影片在某条线路上的全部集数。 */
@Entity('lcm_vod_play', { comment: '影片的播放线路数据，一行 = 某影片在某线路上的全部集数' })
export class VodPlayEntity extends AppBaseEntity {
  @Column({
    name: 'vod_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '影片 id',
  })
  vodId!: string;

  @Column({
    name: 'source_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: 'NULL 表示手工添加的线路',
  })
  sourceId!: string | null;

  @Column({
    name: 'source_from',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '线路标识，如 lzm3u8',
  })
  sourceFrom!: string;

  @Column({
    name: 'source_vod_id',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '源站内的影片 id，用于增量比对（源站命名空间，保持字符串）',
  })
  sourceVodId!: string;

  @Column({
    name: 'source_updated_at',
    type: 'datetime',
    precision: 0,
    nullable: true,
    comment: '源站给出的更新时间，用于判断是否要更新',
  })
  sourceUpdatedAt!: Date | null;

  @Column({
    name: 'collected_at',
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    comment: '采集时间',
  })
  collectedAt!: Date;

  @Column({
    name: 'play_url',
    type: 'mediumtext',
    comment: '整串播放地址：第1集$http://...#第2集$http://...',
  })
  playUrl!: string;
}
