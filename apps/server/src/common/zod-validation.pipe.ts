import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

/** 把 zod schema 当作 ValidationPipe 用，校验失败时把 issues 拼成一句中文提示。 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    void metadata;
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const msg = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new BadRequestException(msg);
  }
}
