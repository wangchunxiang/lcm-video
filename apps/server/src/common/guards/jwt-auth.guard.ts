import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { bearerToken, verifyToken } from '../security/jwt';
import type { AuthedRequest } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AdminRow {
  id: string;
  username: string;
  nickname: string;
  isEnabled: number;
  passwordVersion: number;
}

/**
 * 全局登录守卫（决策 5.3）：默认所有接口都要登录，`@Public()` 的除外。
 * token 放 `Authorization: Bearer <token>`，前端存 localStorage。
 * 失败抛 401/403，由 AllExceptionsFilter 转成 code 100401 / 100403。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
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

    const secret = this.config.get<string>('app.jwtSecret') ?? '';
    const payload = verifyToken(token, secret);
    if (payload === null) throw new UnauthorizedException('登录已失效，请重新登录');

    const rows = await this.dataSource.query<AdminRow[]>(
      'SELECT id, username, nickname, is_enabled AS isEnabled, password_version AS passwordVersion FROM lcm_admin_user WHERE id = ? LIMIT 1',
      [payload.uid],
    );
    const user = rows.at(0);
    if (user === undefined) throw new UnauthorizedException('账号不存在');
    if (user.isEnabled !== 1) throw new ForbiddenException('账号已被禁用');
    if (user.passwordVersion !== payload.pv) {
      throw new UnauthorizedException('密码已修改，请重新登录');
    }

    request.auth = { id: String(user.id), username: user.username, nickname: user.nickname };
    return true;
  }
}
