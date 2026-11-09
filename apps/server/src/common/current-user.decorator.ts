import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** 通过守卫后挂在请求上的登录用户。 */
export interface AuthUser {
  id: number;
  username: string;
  nickname: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthUser;
}

/** 取当前登录用户；未登录时由守卫提前拦下，这里不会是 undefined。 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    return request.auth as AuthUser;
  },
);
