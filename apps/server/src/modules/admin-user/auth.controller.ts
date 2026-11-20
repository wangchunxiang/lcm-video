import { Body, Controller, Get, Header, Post, Put, Req } from '@nestjs/common';
import { ADMIN_API_PREFIX } from '../../common/http/api-prefix';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { createCaptcha } from '../../common/security/captcha';
import type { CaptchaVO } from '../../common/security/captcha';
import { AdminUserService } from './admin-user.service';
import type { AdminUserVO } from './admin-user.service';
import { ChangePasswordDTO, LoginDTO, UpdateProfileDTO } from './dto/admin-user.dto';
import type { LoginVO } from './dto/admin-user.dto';

/**
 * 会话与自助操作。
 * 只有登录是 `@Public()`；其余要求已登录（全局守卫兜底）。
 */
@Controller(`${ADMIN_API_PREFIX}/auth`)
export class AuthController {
  constructor(private readonly adminUserService: AdminUserService) {}

  /**
   * 登录验证码。答案只在服务端内存里，响应里只带 SVG 与一次性 id。
   * `no-store`：验证码是随机的，任何一个中间层缓存都会让所有人看到同一张图。
   */
  @Public()
  @Get('captcha')
  @Header('Cache-Control', 'no-store')
  captcha(): CaptchaVO {
    return createCaptcha();
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDTO, @Req() request: Request): Promise<LoginVO> {
    return this.adminUserService.login(dto, request.ip ?? '0.0.0.0');
  }

  /** 登出不需要服务端状态：token 在 localStorage，前端删掉即可。 */
  @Post('logout')
  logout(): { success: boolean } {
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AdminUserVO> {
    return this.adminUserService.me(user.id);
  }

  @Put('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDTO): Promise<AdminUserVO> {
    return this.adminUserService.updateProfile(user.id, dto);
  }

  @Put('password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDTO,
  ): Promise<{ success: boolean }> {
    return this.adminUserService.changePassword(user.id, dto);
  }
}
