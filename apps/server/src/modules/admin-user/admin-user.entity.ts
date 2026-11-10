import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/crud/app-base.entity';

/** 后台账号。当前单账号全权限模型，无角色列。 */
@Entity('lcm_admin_user')
@Index('uk_username', ['username'], { unique: true })
export class AdminUserEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 50, default: '' })
  username!: string;

  /** `scrypt$N$r$p$salt$hash` */
  @Column({ type: 'varchar', length: 255, default: '' })
  password!: string;

  @Column({ type: 'varchar', length: 50, default: '' })
  nickname!: string;

  @Column({ name: 'is_enabled', type: 'tinyint', unsigned: true, default: 1 })
  isEnabled!: number;

  /** 改密码时自增，使旧 token 失效 */
  @Column({ name: 'password_version', type: 'int', unsigned: true, default: 0 })
  passwordVersion!: number;

  @Column({ name: 'last_login_at', type: 'datetime', precision: 0, nullable: true })
  lastLoginAt!: Date | null;

  /** IPv6 完整写法上限 */
  @Column({ name: 'last_login_ip', type: 'varchar', length: 45, nullable: true })
  lastLoginIp!: string | null;
}
