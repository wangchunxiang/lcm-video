import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/current-user.decorator';
import type { Page } from '../../common/page';
import { Public } from '../../common/public.decorator';
import { AdminUserService } from './admin-user.service';
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
import {
  AdminUserAllDTO as AllSchema,
  AdminUserCreateDTO as CreateSchema,
  AdminUserDeleteDTO as DeleteSchema,
  AdminUserGetDTO as GetSchema,
  AdminUserPageDTO as PageSchema,
  AdminUserUpdateDTO as UpdateSchema,
  ChangePasswordDTO as ChangePasswordSchema,
  LoginDTO as LoginSchema,
  ProfileDTO as ProfileSchema,
} from './dto/admin-user';

/** 账号表的六个标准接口，路径 /api/admin/admin-user/<动作>。 */
@Controller('api/admin/admin-user')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Post('create')
  async create(@Body(new ZodValidationPipe(CreateSchema)) dto: AdminUserCreateDTO): Promise<AdminUserVO> {
    return this.adminUserService.create(dto);
  }

  @Post('update')
  async update(
    @Body(new ZodValidationPipe(UpdateSchema)) dto: AdminUserUpdateDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminUserVO> {
    return this.adminUserService.update(dto, user.id);
  }

  @Post('delete')
  async delete(
    @Body(new ZodValidationPipe(DeleteSchema)) dto: AdminUserDeleteDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<{ deleted: number }> {
    return this.adminUserService.delete(dto, user.id);
  }

  @Post('get')
  async get(@Body(new ZodValidationPipe(GetSchema)) dto: AdminUserGetDTO): Promise<AdminUserVO> {
    return this.adminUserService.get(dto);
  }

  @Post('page')
  async page(@Body(new ZodValidationPipe(PageSchema)) dto: AdminUserPageDTO): Promise<Page<AdminUserVO>> {
    return this.adminUserService.page(dto);
  }

  @Post('all')
  async all(@Body(new ZodValidationPipe(AllSchema)) dto: AdminUserAllDTO): Promise<AdminUserVO[]> {
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
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDTO,
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
    @Body(new ZodValidationPipe(ProfileSchema)) dto: ProfileDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminUserVO> {
    return this.adminUserService.updateProfile(user.id, dto);
  }

  @Post('account/password')
  async password(
    @Body(new ZodValidationPipe(ChangePasswordSchema)) dto: ChangePasswordDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<null> {
    return this.adminUserService.changePassword(user.id, dto);
  }
}
