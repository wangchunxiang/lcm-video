import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集记录明细，一页一行。 */
@Entity('lcm_collect_task_log_detail', { comment: '采集记录明细，一页一行' })
@Index('idx_log_page', ['logId', 'page'])
export class CollectTaskLogDetailEntity extends AppBaseEntity {
  @Column({
    name: 'log_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '所属采集记录 id',
  })
  logId!: string;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '页码',
  })
  page!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '该页条数（上级表是累计值）',
  })
  total!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '本页新增',
  })
  inserted!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '本页更新',
  })
  updated!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '本页跳过',
  })
  skipped!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '本页忽略',
  })
  ignored!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '本页失败',
  })
  failed!: number;

  @Column({
    name: 'fail_detail',
    type: 'json',
    nullable: true,
    comment: '`[{ vodId, name, reason }]`',
  })
  failDetail!: unknown | null;

  @Column({
    type: 'varchar',
    length: 500,
    default: '',
    comment: '该页结论；整页请求失败时只填这里',
  })
  message!: string;
}
