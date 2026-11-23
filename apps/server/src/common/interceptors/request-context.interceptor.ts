import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { runInRequestContext } from '../context/request-context';
import type { AuthedRequest } from '../decorators/current-user.decorator';

/**
 * 把登录人放进请求上下文，供 service 里的 `currentUserId()` 读取。
 *
 * 位置要求：必须排在全局拦截器最前面，且在守卫之后——守卫先填 `request.auth`，
 * 这里才能拿到人；`next.handle()` 在上下文里被调用，后面所有拦截器、控制器、
 * service 都在同一份上下文里执行。
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    return runInRequestContext({ userId: request.auth?.id }, () => next.handle());
  }
}
