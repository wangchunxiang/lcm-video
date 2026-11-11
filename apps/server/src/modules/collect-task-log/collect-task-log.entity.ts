import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集任务的执行记录。 */
@Entity('lcm_collect_task_log', { comment: '采集任务的执行记录' })
@Index('idx_task_started', ['taskId', 'startedAt'])
@Index('idx_started', ['startedAt'])
@Index('idx_source_started', ['sourceId', 'startedAt'])
export class CollectTaskLogEntity extends AppBaseEntity {
  @Column({
    name: 'task_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '0 表示手动采集',
  })
  taskId!: string;

  @Column({
    name: 'source_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '采集源 id',
  })
  sourceId!: string;

  @Column({
    name: 'task_name',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '任务名快照，任务删除后仍可显示',
  })
  taskName!: string;

  @Column({
    name: 'range_type',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 最近24小时 2 最近7天 3 最近30天 4 全部',
  })
  rangeType!: number;

  @Column({
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 运行中 2 成功 3 失败 4 已取消',
  })
  status!: number;

  @Column({
    name: 'total_pages',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '总页数',
  })
  totalPages!: number;

  @Column({
    name: 'last_page',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '已完成到第几页，断点续采锚点',
  })
  lastPage!: number;

  @Column({
    name: 'resume_count',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '续采次数',
  })
  resumeCount!: number;

  @Column({
    name: 'interrupted_ms',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计中断毫秒，用于扣减停机时间',
  })
  interruptedMs!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计总条数',
  })
  total!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计新增',
  })
  inserted!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计更新',
  })
  updated!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计跳过',
  })
  skipped!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计忽略',
  })
  ignored!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '累计失败',
  })
  failed!: number;

  @Column({
    type: 'varchar',
    length: 500,
    default: '',
    comment: '运行结论',
  })
  message!: string;

  @Column({
    name: 'started_at',
    type: 'datetime',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    comment: '开始时间',
  })
  startedAt!: Date;

  @Column({
    name: 'finished_at',
    type: 'datetime',
    precision: 0,
    nullable: true,
    comment: '结束时间',
  })
  finishedAt!: Date | null;
}
