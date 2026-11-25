import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 后台账号。当前单账号全权限模型，无角色列。 */
@Entity('lcm_admin_user', { comment: '后台账号' })
export class AdminUserEntity extends AppBaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    default: '',
    comment: '登录名',
  })
  username!: string;

  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    comment: '`scrypt$N$r$p$salt$hash`',
  })
  password!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: '',
    comment: '昵称',
  })
  nickname!: string;

  @Column({
    name: 'is_enabled',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '1 启用 0 停用',
  })
  isEnabled!: number;

  @Column({
    name: 'password_version',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '改密码时自增，使旧 token 失效',
  })
  passwordVersion!: number;

  @Column({
    name: 'last_login_at',
    type: 'datetime',
    precision: 0,
    nullable: true,
    comment: '最近登录时间',
  })
  lastLoginAt!: Date | null;

  @Column({
    name: 'last_login_ip',
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'IPv6 完整写法上限',
  })
  lastLoginIp!: string | null;
}
