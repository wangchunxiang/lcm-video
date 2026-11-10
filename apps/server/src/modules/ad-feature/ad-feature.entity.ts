import { Column, Entity, Index, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 广告特征库：按分片时长指纹识别片头/片中/片尾广告。 */
@Entity('lcm_ad_feature')
@Unique('uk_source_durations', ['sourceId', 'durations'])
@Index('idx_source', ['sourceId'])
export class AdFeatureEntity extends AppBaseEntity {
  @Column({ name: 'source_id', type: 'bigint', unsigned: true, default: 0 })
  sourceId!: string;

  /** 1 片头 2 片中 3 片尾 */
  @Column({ type: 'tinyint', unsigned: true, default: 2 })
  kind!: number;

  /** 分片时长指纹，逗号分隔（字符串才能建唯一索引） */
  @Column({ type: 'varchar', length: 255 })
  durations!: string;

  @Column({ name: 'total_ms', type: 'int', unsigned: true, default: 0 })
  totalMs!: number;

  @Column({ name: 'hit_vods', type: 'int', unsigned: true, default: 0 })
  hitVods!: number;

  /** `[{ vod_id, vod_name, start, start_sec, url }]` */
  @Column({ type: 'json', nullable: true })
  sample!: unknown | null;
}
