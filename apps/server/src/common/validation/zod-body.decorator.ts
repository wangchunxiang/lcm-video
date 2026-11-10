import { Body } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * `@Body()` + zod 校验的合并写法。
 *
 * 原来每个接口都要写 `@Body(new ZodValidationPipe(CreateDTO))`，schema 与类型
 * 还得分别 import 两次、再起一个别名。封装后参数装饰器直接用 schema 本身：
 *
 * ```ts
 * @Post('create')
 * async create(@ZodBody(CreateDTO) dto: CreateDTO) { ... }
 * ```
 *
 * 注意：这只是省掉重复书写，校验仍然必须显式挂上——`@Body() dto: CreateDTO`
 * 不会触发任何校验（类型在运行时不存在）。
 */
export function ZodBody(schema: ZodType): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
