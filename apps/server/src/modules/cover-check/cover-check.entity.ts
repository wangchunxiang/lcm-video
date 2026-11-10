import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 图片域名体检：域名级，每域名抽查 2 张。 */
@Entity('lcm_cover_check')
@Index('uk_host', ['host'], { unique: true })
@Index('idx_status', ['status'])
export class CoverCheckEntity extends AppBaseEntity {
  /** 封面域名，不含协议与路径 */
  @Column({ type: 'varchar', length: 255, default: '' })
  host!: string;

  /** 检查时引用该域名的影片数快照 */
  @Column({ name: 'vod_count', type: 'int', unsigned: true, default: 0 })
  vodCount!: number;

  /** 0 未检查 1 正常 2 失效 3 无法验证 */
  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  status!: number;

  @Column({ name: 'sample_ok', type: 'int', unsigned: true, default: 0 })
  sampleOk!: number;

  @Column({ name: 'sample_fail', type: 'int', unsigned: true, default: 0 })
  sampleFail!: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  message!: string;

  @Column({ name: 'checked_at', type: 'datetime', precision: 0, nullable: true })
  checkedAt!: Date | null;
}
