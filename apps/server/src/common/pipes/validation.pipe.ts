import { BadRequestException, Injectable, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/** 把嵌套的 ValidationError 拍平成「字段: 提示」的列表。 */
function flatten(errors: ValidationError[], parent = ''): string[] {
  const result: string[] = [];
  for (const error of errors) {
    const path = parent === '' ? error.property : `${parent}.${error.property}`;
    for (const message of Object.values(error.constraints ?? {})) {
      result.push(`${path}: ${message}`);
    }
    if (error.children !== undefined && error.children.length > 0) {
      result.push(...flatten(error.children, path));
    }
  }
  return result;
}

/**
 * 全局入参校验（决策 2.5）。
 * - `whitelist` + `forbidNonWhitelisted`：DTO 没声明的字段直接拒绝，防止脏字段进 service
 * - `transform`：query 里的字符串按 DTO 的 `@Type` 转成数字/布尔
 * - 失败时抛 BadRequestException，msg 是「字段: 中文提示；…」，由异常出口原样回前端
 */
@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException(flatten(errors).join('；')),
    });
  }
}
