import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 站点配置 KV。类型校验与默认值由 `packages/shared` 的 schema 负责。 */
@Entity('lcm_setting', { comment: '站点配置 KV' })
export class SettingEntity extends AppBaseEntity {
  @Column({
    name: 'name',
    type: 'varchar',
    length: 50,
    default: '',
    comment: '配置键（库里列名是 `name`，这里叫 key 以对齐读写语义）',
  })
  key!: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '配置值，JSON 或纯文本',
  })
  value!: string | null;
}
