import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 广告特征库：按分片时长指纹识别片头/片中/片尾广告。 */
@Entity('lcm_ad_feature', { comment: '广告特征库：按分片时长指纹识别片头/片中/片尾广告' })
export class AdFeatureEntity extends AppBaseEntity {
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
    default: 2,
    comment: '1 片头 2 片中 3 片尾',
  })
  kind!: number;

  @Column({
    type: 'varchar',
    length: 255,
    comment: '分片时长指纹，逗号分隔（字符串才能建唯一索引）',
  })
  durations!: string;

  @Column({
    name: 'total_ms',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '分片总时长（毫秒）',
  })
  totalMs!: number;

  @Column({
    name: 'hit_vods',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '命中影片数',
  })
  hitVods!: number;

  @Column({
    type: 'json',
    nullable: true,
    comment: '`[{ vod_id, vod_name, start, start_sec, url }]`',
  })
  sample!: unknown | null;
}
