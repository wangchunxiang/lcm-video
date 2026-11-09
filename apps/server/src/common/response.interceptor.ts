import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import type { ApiResponse } from './api-response';
import { OK } from './api-response';
import { RAW_KEY } from './raw.decorator';

/** 把每个 controller 的返回值包成 { code, msg, data }。 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const raw = this.reflector.get<boolean | undefined>(RAW_KEY, context.getHandler());
    if (raw === true) {
      return next.handle() as unknown as Observable<ApiResponse<T>>;
    }
    return next.handle().pipe(map((data) => ({ code: OK, msg: 'ok', data: data ?? null })));
  }
}
