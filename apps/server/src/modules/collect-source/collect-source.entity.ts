import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 采集源站，只支持 json 接口。 */
@Entity('lcm_collect_source')
@Index('idx_enabled', ['isEnabled'])
export class CollectSourceEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 50, default: '' })
  name!: string;

  /** 采集接口地址 */
  @Column({ name: 'api_url', type: 'varchar', length: 255, default: '' })
  apiUrl!: string;

  /** 附加参数串，如 t=1 */
  @Column({ name: 'api_params', type: 'varchar', length: 500, default: '' })
  apiParams!: string;

  /** 播放解析接口，空表示直连 */
  @Column({ name: 'parse_url', type: 'varchar', length: 255, default: '' })
  parseUrl!: string;

  @Column({ name: 'is_enabled', type: 'tinyint', unsigned: true, default: 1 })
  isEnabled!: number;

  /** 请求间隔秒数，避免被封 */
  @Column({ name: 'interval_sec', type: 'int', unsigned: true, default: 3 })
  intervalSec!: number;

  /** 每页条数 1~100 */
  @Column({ type: 'int', unsigned: true, default: 100 })
  pagesize!: number;

  @Column({ type: 'int', unsigned: true, default: 30 })
  timeout!: number;

  @Column({ name: 'retry_times', type: 'tinyint', unsigned: true, default: 2 })
  retryTimes!: number;

  @Column({ name: 'last_sync_at', type: 'datetime', precision: 0, nullable: true })
  lastSyncAt!: Date | null;

  /** 0 未同步 1 成功 2 失败 */
  @Column({ name: 'last_sync_status', type: 'tinyint', unsigned: true, default: 0 })
  lastSyncStatus!: number;

  @Column({ name: 'last_sync_msg', type: 'varchar', length: 255, default: '' })
  lastSyncMsg!: string;

  /** 最近一次采集到的线路标识，逗号分隔，后台候选提示用 */
  @Column({ name: 'play_from', type: 'varchar', length: 500, default: '' })
  playFrom!: string;
}
