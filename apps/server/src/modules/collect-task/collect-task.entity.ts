import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集任务。 */
@Entity('lcm_collect_task')
@Index('idx_source', ['sourceId'])
@Index('idx_enabled', ['isEnabled'])
export class CollectTaskEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 50, default: '' })
  name!: string;

  @Column({ name: 'source_id', type: 'bigint', unsigned: true, default: 0 })
  sourceId!: string;

  /** 1 最近24小时 2 最近7天 3 最近30天 4 全部 */
  @Column({ name: 'range_type', type: 'tinyint', unsigned: true, default: 1 })
  rangeType!: number;

  /** 5 段 cron */
  @Column({ type: 'varchar', length: 50, default: '' })
  cron!: string;

  @Column({ name: 'is_enabled', type: 'tinyint', unsigned: true, default: 1 })
  isEnabled!: number;

  @Column({ name: 'last_run_at', type: 'datetime', precision: 0, nullable: true })
  lastRunAt!: Date | null;

  /** 0 未运行 1 运行中 2 成功 3 失败 4 已取消 */
  @Column({ name: 'last_run_status', type: 'tinyint', unsigned: true, default: 0 })
  lastRunStatus!: number;

  @Column({ name: 'last_run_msg', type: 'varchar', length: 255, default: '' })
  lastRunMsg!: string;
}
