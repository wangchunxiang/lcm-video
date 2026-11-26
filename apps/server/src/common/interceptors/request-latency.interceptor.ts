import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { recordLatency } from '../metrics/latency';

/** Express 匹配到路由之后才会挂 `route`，静态文件与 404 走不到这个拦截器 */
type RoutedRequest = Request & { route?: { path?: string } };

/**
 * 记录每个接口的耗时，key 用「方法 + 路由模板」而不是完整 URL：
 * `/api/web/vod/:id` 是一条曲线，`/api/web/vod/123` 会散成上千条。
 *
 * 位置：排在全局拦截器最前面，这样统计到的时长包含后续拦截器与控制器，
 * 且不依赖 `RequestContextInterceptor` 挂的登录人。
 *
 * 用 `finalize` 而不是 `tap`：客户端断开、上游抛错时也要有样本，
 * 否则最慢的那批请求恰好不会被记录。
 */
@Injectable()
export class RequestLatencyInterceptor implements NestInterceptor<unknown, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RoutedRequest>();
    const response = http.getResponse<Response>();
    const key = `http ${request.method} ${request.route?.path ?? request.path}`;
    const startedAt = performance.now();
    return next.handle().pipe(
      finalize(() => {
        // 决策 2.3：状态码恒为 200，语义在信封的 code 里，所以这里只看有没有抛错
        recordLatency(key, performance.now() - startedAt, { ok: response.statusCode < 400 });
      }),
    );
  }
}
