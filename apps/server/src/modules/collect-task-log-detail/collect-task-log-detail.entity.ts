import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集记录明细，一页一行。 */
@Entity('lcm_collect_task_log_detail')
@Index('idx_log_page', ['logId', 'page'])
export class CollectTaskLogDetailEntity extends AppBaseEntity {
  @Column({ name: 'log_id', type: 'bigint', unsigned: true, default: 0 })
  logId!: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  page!: number;

  /** 该页条数（上级表是累计值） */
  @Column({ type: 'int', unsigned: true, default: 0 })
  total!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  inserted!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  updated!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  skipped!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  ignored!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  failed!: number;

  /** `[{ vodId, name, reason }]` */
  @Column({ name: 'fail_detail', type: 'json', nullable: true })
  failDetail!: unknown | null;

  /** 该页结论；整页请求失败时只填这里 */
  @Column({ type: 'varchar', length: 500, default: '' })
  message!: string;
}
