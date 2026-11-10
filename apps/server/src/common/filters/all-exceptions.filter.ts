import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CODE_FORBIDDEN,
  CODE_SERVER_ERROR,
  CODE_UNAUTHORIZED,
  FAIL,
} from '../http/api-response';

interface ErrorBody {
  code?: unknown;
  msg?: unknown;
  message?: unknown;
}

/**
 * 全局异常出口：任何异常都回 HTTP 200 + `{ code, msg, data: null, reqId }`。
 * 业务抛 `BadRequestException` 时 msg 就是给前端看的文案（决策 2.4：只判断 code）。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();
    const reqId = typeof request.id === 'string' ? request.id : undefined;

    let code = FAIL;
    let msg = '服务器异常';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body: unknown = exception.getResponse();
      if (typeof body === 'string') {
        msg = body;
      } else if (typeof body === 'object' && body !== null) {
        const parsed = body as ErrorBody;
        if (typeof parsed.code === 'number') {
          code = parsed.code;
        } else if (status === HttpStatus.UNAUTHORIZED) {
          code = CODE_UNAUTHORIZED;
        } else if (status === HttpStatus.FORBIDDEN) {
          code = CODE_FORBIDDEN;
        }
        const detail = parsed.msg ?? parsed.message;
        if (typeof detail === 'string') {
          msg = detail;
        } else if (Array.isArray(detail)) {
          msg = detail.filter((item): item is string => typeof item === 'string').join('; ');
        }
      }
    }

    // 非 HttpException 一律不回原始 message：驱动的报错里带 SQL 片段和列名，
    // 只留在日志里靠 reqId 关联，前端只需要知道「服务器异常」。
    if (!(exception instanceof HttpException)) {
      msg = '服务器异常';
    }

    // nest-crud 找不到记录时抛的是 `<实体名> not found`，统一成中文
    if (status === HttpStatus.NOT_FOUND && /not found$/i.test(msg)) {
      msg = '记录不存在';
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      code = CODE_SERVER_ERROR;
      msg = '服务器异常';
      this.logger.error({ reqId, err: exception }, '未处理的异常');
    }

    response.status(HttpStatus.OK).json({ code, msg, data: null, reqId });
  }
}
