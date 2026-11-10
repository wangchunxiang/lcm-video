import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminUser, Prisma } from '@prisma/client';
import type { Page } from '../../common/pagination/page';
import { toPage } from '../../common/pagination/page';
import { signToken } from '../../common/security/jwt';
import { hashPassword, verifyPassword } from '../../common/security/password';
import { isLocked, recordFailure, resetFailures } from '../../common/security/login-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingService } from '../setting/setting.service';
import type {
  AdminUserAllDTO,
  AdminUserCreateDTO,
  AdminUserDeleteDTO,
  AdminUserGetDTO,
  AdminUserPageDTO,
  AdminUserUpdateDTO,
  AdminUserVO,
  ChangePasswordDTO,
  LoginDTO,
  LoginVO,
  ProfileDTO,
} from './dto/admin-user';

const ALL_LIMIT = 1000;
const DEFAULT_EXPIRE_DAYS = 7;

function toVO(row: AdminUser): AdminUserVO {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    isEnabled: row.isEnabled,
    lastLoginAt: row.lastLoginAt === null ? null : row.lastLoginAt.toISOString(),
    lastLoginIp: row.lastLoginIp,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingService,
  ) {}

  /** 登录：连续失败 5 次锁 15 分钟；成功后发 token 并记一次登录时间与 IP。 */
  async login(dto: LoginDTO, ip: string): Promise<LoginVO> {
    if (isLocked(ip)) throw new BadRequestException('尝试次数过多，请 15 分钟后再试');

    const user = await this.prisma.adminUser.findUnique({ where: { username: dto.username } });
    const passed = user !== null && verifyPassword(dto.password, user.password);
    if (user === null || !passed) {
      recordFailure(ip);
      throw new UnauthorizedException('账号或密码错误');
    }
    if (user.isEnabled !== 1) throw new UnauthorizedException('账号已被禁用');

    resetFailures(ip);

    const days = await this.settings.number('login_expire_days', DEFAULT_EXPIRE_DAYS);
    const expireAt = Math.floor(Date.now() / 1000) + days * 86400;
    const secret = this.config.get<string>('JWT_SECRET') ?? '';
    const token = signToken({ uid: user.id, pv: user.passwordVersion, exp: expireAt }, secret);

    const updated = await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip.slice(0, 45) },
    });

    return { token, expireAt, user: toVO(updated) };
  }

  async me(id: number): Promise<AdminUserVO> {
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    if (row === null) throw new NotFoundException('账号不存在');
    return toVO(row);
  }

  async create(dto: AdminUserCreateDTO): Promise<AdminUserVO> {
    const exists = await this.prisma.adminUser.count({ where: { username: dto.username } });
    if (exists > 0) throw new BadRequestException('账号已存在');

    const row = await this.prisma.adminUser.create({
      data: {
        username: dto.username,
        password: hashPassword(dto.password),
        nickname: dto.nickname.length > 0 ? dto.nickname : dto.username,
        isEnabled: dto.isEnabled,
      },
    });
    return toVO(row);
  }

  /** 改密码会自增 passwordVersion，已发出的 token 全部失效。 */
  async update(dto: AdminUserUpdateDTO, operatorId: number): Promise<AdminUserVO> {
    const current = await this.prisma.adminUser.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('账号不存在');
    if (dto.isEnabled === 0 && dto.id === operatorId) throw new BadRequestException('不能禁用当前登录的账号');

    if (dto.username !== undefined && dto.username !== current.username) {
      const exists = await this.prisma.adminUser.count({ where: { username: dto.username } });
      if (exists > 0) throw new BadRequestException('账号已存在');
    }

    const data: Prisma.AdminUserUpdateInput = {
      username: dto.username,
      nickname: dto.nickname,
      isEnabled: dto.isEnabled,
    };
    if (dto.password !== undefined) {
      data.password = hashPassword(dto.password);
      data.passwordVersion = { increment: 1 };
    }

    const row = await this.prisma.adminUser.update({ where: { id: dto.id }, data });
    return toVO(row);
  }

  /** 删除：不能删自己，也不能把启用中的账号删空。 */
  async delete(dto: AdminUserDeleteDTO, operatorId: number): Promise<{ deleted: number }> {
    if (dto.ids.includes(operatorId)) throw new BadRequestException('不能删除当前登录的账号');

    const enabledLeft = await this.prisma.adminUser.count({
      where: { isEnabled: 1, id: { notIn: dto.ids } },
    });
    if (enabledLeft === 0) throw new BadRequestException('至少要保留一个启用状态的账号');

    const result = await this.prisma.adminUser.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: AdminUserGetDTO): Promise<AdminUserVO> {
    const rows = await this.prisma.adminUser.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('账号不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return toVO(rows[0] as AdminUser);
  }

  async page(dto: AdminUserPageDTO): Promise<Page<AdminUserVO>> {
    const where = this.buildWhere({ keyword: dto.keyword, isEnabled: dto.isEnabled });
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminUser.count({ where }),
      this.prisma.adminUser.findMany({
        where,
        orderBy: [{ id: 'asc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    return toPage(rows.map(toVO), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: AdminUserAllDTO): Promise<AdminUserVO[]> {
    const rows = await this.prisma.adminUser.findMany({
      where: this.buildWhere({ isEnabled: dto.isEnabled }),
      orderBy: [{ id: 'asc' }],
      take: ALL_LIMIT,
    });
    return rows.map(toVO);
  }

  async updateProfile(id: number, dto: ProfileDTO): Promise<AdminUserVO> {
    const row = await this.prisma.adminUser.update({ where: { id }, data: { nickname: dto.nickname } });
    return toVO(row);
  }

  /** 改自己的密码：校验原密码，成功后 passwordVersion +1，旧 token 全部失效。 */
  async changePassword(id: number, dto: ChangePasswordDTO): Promise<null> {
    if (dto.newPassword === dto.oldPassword) throw new BadRequestException('新密码不能与原密码相同');

    const current = await this.prisma.adminUser.findUnique({ where: { id } });
    if (current === null) throw new NotFoundException('账号不存在');
    if (!verifyPassword(dto.oldPassword, current.password)) throw new BadRequestException('原密码不正确');

    await this.prisma.adminUser.update({
      where: { id },
      data: { password: hashPassword(dto.newPassword), passwordVersion: { increment: 1 } },
    });
    return null;
  }

  private buildWhere(input: {
    id?: number;
    username?: string;
    keyword?: string;
    isEnabled?: number;
  }): Prisma.AdminUserWhereInput {
    const where: Prisma.AdminUserWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.username !== undefined) where.username = input.username;
    if (input.isEnabled !== undefined) where.isEnabled = input.isEnabled;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.OR = [{ username: { contains: input.keyword } }, { nickname: { contains: input.keyword } }];
    }
    return where;
  }
}
