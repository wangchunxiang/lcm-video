import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 站点配置 KV。类型校验与默认值由 `packages/shared` 的 schema 负责。 */
@Entity('lcm_setting')
@Index('uk_name', ['key'], { unique: true })
export class SettingEntity extends AppBaseEntity {
  /** 配置键（库里列名是 `name`，这里叫 key 以对齐读写语义） */
  @Column({ name: 'name', type: 'varchar', length: 50, default: '' })
  key!: string;

  @Column({ type: 'text', nullable: true })
  value!: string | null;
}
