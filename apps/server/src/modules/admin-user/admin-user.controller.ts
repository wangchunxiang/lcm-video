import {
  Controller,
  Post,
  Req,
} from '@nestjs/common';

import {
  CurrentUser,
} from '../../common/security/current-user.decorator';

import { ZodBody } from '../../common/validation/zod-body.decorator';

import type {
  AuthUser,
} from '../../common/security/current-user.decorator';

import type {
  Page,
} from '../../common/pagination/page';

import {
  Public,
} from '../../common/security/public.decorator';

import type {
  Request,
} from 'express';

import {
  AdminUserService,
} from './admin-user.service';

import {
  AdminUserAllDTO,
  AdminUserCreateDTO,
  AdminUserDeleteDTO,
  AdminUserGetDTO,
  AdminUserPageDTO,
  AdminUserUpdateDTO,
  ChangePasswordDTO,
  LoginDTO,
  ProfileDTO,
} from './dto/admin-user';

import type {
  AdminUserVO,
  LoginVO,
} from './dto/admin-user';

/** 账号表的六个标准接口，路径 /api/admin/admin-user/<动作>。 */
@Controller('api/admin/admin-user')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Post('create')
  async create(@ZodBody(AdminUserCreateDTO) dto: AdminUserCreateDTO): Promise<AdminUserVO> {
    return this.adminUserService.create(dto);
  }

  @Post('update')
  async update(
    @ZodBody(AdminUserUpdateDTO) dto: AdminUserUpdateDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminUserVO> {
    return this.adminUserService.update(dto, user.id);
  }

  @Post('delete')
  async delete(
    @ZodBody(AdminUserDeleteDTO) dto: AdminUserDeleteDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<{ deleted: number }> {
    return this.adminUserService.delete(dto, user.id);
  }

  @Post('get')
  async get(@ZodBody(AdminUserGetDTO) dto: AdminUserGetDTO): Promise<AdminUserVO> {
    return this.adminUserService.get(dto);
  }

  @Post('page')
  async page(@ZodBody(AdminUserPageDTO) dto: AdminUserPageDTO): Promise<Page<AdminUserVO>> {
    return this.adminUserService.page(dto);
  }

  @Post('all')
  async all(@ZodBody(AdminUserAllDTO) dto: AdminUserAllDTO): Promise<AdminUserVO[]> {
    return this.adminUserService.all(dto);
  }
}

/**
 * 登录相关的额外接口，挂在同一张表上（决策 2.7：额外接口写主表 controller）。
 * 路径沿用旧站习惯：/api/admin/auth/* 与 /api/admin/account/*。
 */
@Controller('api/admin')
export class AuthController {
  constructor(private readonly adminUserService: AdminUserService) {}

  /** 登录：不限流以外的保护，无需登录。 */
  @Public()
  @Post('auth/login')
  async login(
    @ZodBody(LoginDTO) dto: LoginDTO,
    @Req() request: Request,
  ): Promise<LoginVO> {
    return this.adminUserService.login(dto, request.ip ?? '');
  }

  /** 退出：token 由前端丢弃，服务端只需要一个成功响应。 */
  @Public()
  @Post('auth/logout')
  logout(): null {
    return null;
  }

  @Post('auth/me')
  async me(@CurrentUser() user: AuthUser): Promise<AdminUserVO> {
    return this.adminUserService.me(user.id);
  }

  @Post('account/profile')
  async profile(
    @ZodBody(ProfileDTO) dto: ProfileDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminUserVO> {
    return this.adminUserService.updateProfile(user.id, dto);
  }

  @Post('account/password')
  async password(
    @ZodBody(ChangePasswordDTO) dto: ChangePasswordDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<null> {
    return this.adminUserService.changePassword(user.id, dto);
  }
}
