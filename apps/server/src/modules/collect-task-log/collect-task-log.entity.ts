import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集任务的执行记录。 */
@Entity('lcm_collect_task_log')
@Index('idx_task_started', ['taskId', 'startedAt'])
@Index('idx_started', ['startedAt'])
@Index('idx_source_started', ['sourceId', 'startedAt'])
export class CollectTaskLogEntity extends AppBaseEntity {
  /** 0 表示手动采集 */
  @Column({ name: 'task_id', type: 'bigint', unsigned: true, default: 0 })
  taskId!: string;

  @Column({ name: 'source_id', type: 'bigint', unsigned: true, default: 0 })
  sourceId!: string;

  /** 任务名快照，任务删除后仍可显示 */
  @Column({ name: 'task_name', type: 'varchar', length: 50, default: '' })
  taskName!: string;

  @Column({ name: 'range_type', type: 'tinyint', unsigned: true, default: 1 })
  rangeType!: number;

  /** 1 运行中 2 成功 3 失败 4 已取消 */
  @Column({ type: 'tinyint', unsigned: true, default: 1 })
  status!: number;

  @Column({ name: 'total_pages', type: 'int', unsigned: true, default: 0 })
  totalPages!: number;

  /** 已完成到第几页，断点续采锚点 */
  @Column({ name: 'last_page', type: 'int', unsigned: true, default: 0 })
  lastPage!: number;

  @Column({ name: 'resume_count', type: 'int', unsigned: true, default: 0 })
  resumeCount!: number;

  /** 累计中断毫秒，用于扣减停机时间 */
  @Column({ name: 'interrupted_ms', type: 'int', unsigned: true, default: 0 })
  interruptedMs!: number;

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

  @Column({ type: 'varchar', length: 500, default: '' })
  message!: string;

  @Column({
    name: 'started_at',
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'datetime', precision: 0, nullable: true })
  finishedAt!: Date | null;
}
