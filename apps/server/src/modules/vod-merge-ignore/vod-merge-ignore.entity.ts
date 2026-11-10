import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 重复影片忽略名单：用户在「重复影片」页点「不是重复」后记进来。 */
@Entity('lcm_vod_merge_ignore')
@Index('uk_merge_key', ['mergeKey'], { unique: true })
export class VodMergeIgnoreEntity extends AppBaseEntity {
  /** `auto:<hash>` / `suspect:<hash>~<year>` / `same:<id>-<name>` */
  @Column({ name: 'merge_key', type: 'varchar', length: 64 })
  mergeKey!: string;

  /** 1 严格重复 2 疑似重复 */
  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  kind!: number;
}
