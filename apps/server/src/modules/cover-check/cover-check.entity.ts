import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 图片域名体检：域名级，每域名抽查 2 张。 */
@Entity('lcm_cover_check', { comment: '图片域名体检：域名级，每域名抽查 2 张' })
@Index('uk_host', ['host'], { unique: true })
@Index('idx_status', ['status'])
export class CoverCheckEntity extends AppBaseEntity {
  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '封面域名，不含协议与路径',
  })
  host!: string;

  @Column({
    name: 'vod_count',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '检查时引用该域名的影片数快照',
  })
  vodCount!: number;

  @Column({
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '0 未检查 1 正常 2 失效 3 无法验证',
  })
  status!: number;

  @Column({
    name: 'sample_ok',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '抽查通过数',
  })
  sampleOk!: number;

  @Column({
    name: 'sample_fail',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '抽查失败数',
  })
  sampleFail!: number;

  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '检查结论',
  })
  message!: string;

  @Column({
    name: 'checked_at',
    type: 'datetime',
    precision: 0,
    nullable: true,
    comment: '检查时间',
  })
  checkedAt!: Date | null;
}
