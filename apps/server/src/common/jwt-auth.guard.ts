import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { bearerToken, verifyToken } from './jwt';
import type { AuthedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 全局登录守卫（决策 5.3）：默认所有接口都要登录，`@Public()` 的除外。
 * token 放 `Authorization: Bearer <token>`，前端存 localStorage。
 * 失败抛 401/403，由 AllExceptionsFilter 转成 code 100401 / 100403。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (token === null) throw new UnauthorizedException('请先登录');

    const secret = this.config.get<string>('JWT_SECRET') ?? '';
    const payload = verifyToken(token, secret);
    if (payload === null) throw new UnauthorizedException('登录已失效，请重新登录');

    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.uid },
      select: { id: true, username: true, nickname: true, isEnabled: true, passwordVersion: true },
    });
    if (user === null) throw new UnauthorizedException('账号不存在');
    if (user.isEnabled !== 1) throw new ForbiddenException('账号已被禁用');
    if (user.passwordVersion !== payload.pv) throw new UnauthorizedException('密码已修改，请重新登录');

    request.auth = { id: user.id, username: user.username, nickname: user.nickname };
    return true;
  }
}
