import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集源站，只支持 json 接口。 */
@Entity('lcm_collect_source', { comment: '采集源站，只支持 json 接口' })
@Index('idx_enabled', ['isEnabled'])
export class CollectSourceEntity extends AppBaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    default: '',
    comment: '源站名',
  })
  name!: string;

  @Column({
    name: 'api_url',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '采集接口地址',
  })
  apiUrl!: string;

  @Column({
    name: 'api_params',
    type: 'varchar',
    length: 500,
    default: '',
    comment: '附加参数串，如 t=1',
  })
  apiParams!: string;

  @Column({
    name: 'parse_url',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '播放解析接口，空表示直连',
  })
  parseUrl!: string;

  @Column({
    name: 'is_enabled',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 启用 0 停用',
  })
  isEnabled!: number;

  @Column({
    name: 'interval_sec',
    type: 'int',
    unsigned: true,
    default: 3,
    comment: '请求间隔秒数，避免被封',
  })
  intervalSec!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 100,
    comment: '每页条数 1~100',
  })
  pagesize!: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 30,
    comment: '请求超时（秒）',
  })
  timeout!: number;

  @Column({
    name: 'retry_times',
    type: 'tinyint',
    unsigned: true,
    default: 2,
    comment: '失败重试次数',
  })
  retryTimes!: number;

  @Column({
    name: 'last_sync_at',
    type: 'datetime',
    precision: 0,
    nullable: true,
    comment: '最近一次同步时间',
  })
  lastSyncAt!: Date | null;

  @Column({
    name: 'last_sync_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '0 未同步 1 成功 2 失败',
  })
  lastSyncStatus!: number;

  @Column({
    name: 'last_sync_msg',
    type: 'varchar',
    length: 255,
    default: '',
    comment: '最近一次同步结果说明',
  })
  lastSyncMsg!: string;

  @Column({
    name: 'play_from',
    type: 'varchar',
    length: 500,
    default: '',
    comment: '最近一次采集到的线路标识，逗号分隔，后台候选提示用',
  })
  playFrom!: string;
}
