import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { hashPassword, verifyPassword } from '../../common/security/password';
import { verifyCaptcha } from '../../common/security/captcha';
import { isLocked, recordFailure, resetFailures } from '../../common/security/login-lock';
import { currentUserId } from '../../common/context/request-context';
import { signToken } from '../../common/security/jwt';
import { SettingService } from '../setting/setting.service';
import { AdminUserEntity } from './admin-user.entity';
import type {
  ChangePasswordDTO,
  CreateAdminUserDTO,
  LoginDTO,
  LoginVO,
  UpdateAdminUserDTO,
  UpdateProfileDTO,
} from './dto/admin-user.dto';

/** 未配置 `login_expire_days` 时的默认有效期（天）。 */
const DEFAULT_EXPIRE_DAYS = 7;

/** 对外视图：绝不带密码哈希。 */
export interface AdminUserVO {
  id: string;
  username: string;
  nickname: string;
  isEnabled: number;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
}

function toVO(row: AdminUserEntity): AdminUserVO {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    isEnabled: row.isEnabled,
    // 本方法可能被 service 内部调用（不经由信封拦截器），这里自己转 ISO
    lastLoginAt: row.lastLoginAt === null ? null : row.lastLoginAt.toISOString(),
    lastLoginIp: row.lastLoginIp,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 后台账号（决策 5.3）。
 *
 * 单账号全权限模型：没有角色表、没有刷新令牌。密码用 scrypt，改密码时
 * `password_version` 自增，让所有旧 token 立即失效。
 */
@Injectable()
export class AdminUserService extends AppCrudService<AdminUserEntity> {
  constructor(
    @InjectRepository(AdminUserEntity) repository: Repository<AdminUserEntity>,
    private readonly config: ConfigService,
    private readonly settings: SettingService,
  ) {
    super(repository);
  }

  /**
   * 登录：验证码 → 锁定检查 → 账号密码；连续失败 5 次锁 15 分钟；成功后记最后登录时间与 IP。
   *
   * 验证码排在锁定检查前：猜密码的脚本必须每次都过图形识别，成本从「一次 HTTP」
   * 变成「一次 OCR」；同时验证码错误**不计入**失败次数，避免手滑打错就把自己锁 15 分钟。
   */
  async login(dto: LoginDTO, ip: string): Promise<LoginVO> {
    if (!verifyCaptcha(dto.captchaId, dto.captchaCode)) {
      throw new BadRequestException('验证码不正确或已过期，请刷新后重试');
    }

    const lockKey = `login:${ip}`;
    if (isLocked(lockKey)) {
      throw new ForbiddenException('密码错误次数过多，请 15 分钟后再试');
    }

    const user = await this.repository.findOne({ where: { username: dto.username } });
    if (user === null || !verifyPassword(dto.password, user.password)) {
      recordFailure(lockKey);
      throw new UnauthorizedException('账号或密码不正确');
    }
    if (user.isEnabled !== 1) throw new ForbiddenException('账号已被禁用');
    resetFailures(lockKey);

    const days = await this.settings.number('login_expire_days', DEFAULT_EXPIRE_DAYS);
    const expireDays = Number.isFinite(days) && days > 0 ? Math.trunc(days) : DEFAULT_EXPIRE_DAYS;
    const expireAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
    const exp = Math.floor(expireAt.getTime() / 1000);

    const token = signToken(
      { uid: user.id, pv: user.passwordVersion, exp },
      this.config.get<string>('app.jwtSecret') ?? '',
    );

    await this.repository.update(user.id, { lastLoginAt: new Date(), lastLoginIp: ip });
    return {
      token,
      expireAt: expireAt.toISOString(),
      user: { id: user.id, username: user.username, nickname: user.nickname },
    };
  }

  /** 当前登录人。 */
  async me(id: string): Promise<AdminUserVO> {
    const user = await this.repository.findOne({ where: { id } });
    if (user === null) throw new UnauthorizedException('账号不存在');
    return toVO(user);
  }

  /** 新建：账号唯一，密码入库前哈希。 */
  override async create(data: Partial<AdminUserEntity>): Promise<AdminUserEntity> {
    const dto = data as unknown as CreateAdminUserDTO;
    const username = dto.username.trim();
    const exists = await this.repository.findOne({ where: { username } });
    if (exists !== null) throw new BadRequestException(`账号 ${username} 已存在`);

    return super.create({
      username,
      password: hashPassword(dto.password),
      nickname: dto.nickname ?? '',
      isEnabled: dto.isEnabled ?? 1,
    });
  }

  /** 修改：传了密码就重置（版本 +1）并踢掉旧登录；不能把最后一个启用的账号禁用掉。 */
  override async update(
    criteria: string | FindOptionsWhere<AdminUserEntity>,
    data: Partial<AdminUserEntity>,
  ): Promise<AdminUserEntity> {
    const dto = data as unknown as UpdateAdminUserDTO;
    // `currentUserId()` 由 RequestContextInterceptor 在守卫之后挂好；定时任务等
    // 不在请求链路里的调用读到 undefined，此时只剩「最后一个启用账号」这条不变量兜底。
    if (typeof criteria === 'string' && dto.isEnabled === 0) {
      if (criteria === currentUserId()) throw new BadRequestException('不能禁用自己的账号');
      await this.assertNotLastEnabled(criteria);
    }

    const patch: Partial<AdminUserEntity> = {};
    if (dto.nickname !== undefined) patch.nickname = dto.nickname;
    if (dto.isEnabled !== undefined) patch.isEnabled = dto.isEnabled;
    if (dto.password !== undefined) {
      patch.password = hashPassword(dto.password);
      patch.passwordVersion = (await this.currentVersion(criteria)) + 1;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');
    return super.update(criteria, patch);
  }

  /** 删除：不能删自己，也不能把最后一个启用的账号删掉。 */
  override async delete(
    criteria: string | FindOptionsWhere<AdminUserEntity>,
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    if (typeof criteria === 'string') {
      if (criteria === currentUserId()) throw new BadRequestException('不能删除自己的账号');
      await this.assertNotLastEnabled(criteria);
    }

    return super.delete(criteria, softDelete);
  }

  /** 改自己的昵称。 */
  async updateProfile(id: string, dto: UpdateProfileDTO): Promise<AdminUserVO> {
    await this.repository.update(id, { nickname: dto.nickname });
    return this.me(id);
  }

  /** 改自己的密码：校验原密码、新旧不能相同、版本 +1 使旧 token 失效。 */
  async changePassword(id: string, dto: ChangePasswordDTO): Promise<{ success: boolean }> {
    const user = await this.repository.findOne({ where: { id } });
    if (user === null) throw new UnauthorizedException('账号不存在');
    if (!verifyPassword(dto.oldPassword, user.password)) {
      throw new BadRequestException('原密码不正确');
    }
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('新密码不能与原密码相同');
    }
    await this.repository.update(id, {
      password: hashPassword(dto.newPassword),
      passwordVersion: user.passwordVersion + 1,
    });
    return { success: true };
  }

  /**
   * 禁用/删除前确认库里还剩下别的启用账号。
   *
   * 账号只有一张表、没有找回入口，最后一个启用账号被禁或被删就等于后台永久锁死，
   * 所以 `update`（禁用）与 `delete` 共守这一条不变量。
   */
  private async assertNotLastEnabled(id: string): Promise<void> {
    const target = await this.repository.findOne({ where: { id } });
    if (target === null || target.isEnabled !== 1) return;
    const enabled = await this.repository.count({ where: { isEnabled: 1 } });
    if (enabled <= 1) throw new BadRequestException('至少要保留一个启用状态的账号');
  }

  private async currentVersion(criteria: string | FindOptionsWhere<AdminUserEntity>): Promise<number> {
    const user = await this.repository.findOne({
      where: typeof criteria === 'string' ? { id: criteria } : criteria,
    });
    if (user === null) throw new BadRequestException('账号不存在');
    return user.passwordVersion;
  }
}
