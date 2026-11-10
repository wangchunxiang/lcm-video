import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { OK } from '../http/api-response';
import type { ApiResponse } from '../http/api-response';
import { RAW_KEY } from '../decorators/raw.decorator';

/**
 * 把 `Date` 递归转成 ISO 字符串（决策 8.2：接口里的时间统一是 `2026-11-10T10:00:00.000Z`）。
 * 放在信封里做，业务 service 就不用逐字段 `.toISOString()`。
 */
function serializeDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serializeDates(item));
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      result[key] = serializeDates(item);
    }
    return result;
  }
  return value;
}

/** 把每个 controller 的返回值包成 `{ code, msg, data }`。 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<unknown>> {
    const raw = this.reflector.get<boolean | undefined>(RAW_KEY, context.getHandler());
    if (raw === true) {
      return next.handle() as unknown as Observable<ApiResponse<unknown>>;
    }
    return next.handle().pipe(
      map((data) => ({ code: OK, msg: 'ok', data: serializeDates(data ?? null) })),
    );
  }
}
