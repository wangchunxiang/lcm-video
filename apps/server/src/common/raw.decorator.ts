import { SetMetadata } from '@nestjs/common';

/** 标记该接口不套统一信封（文件下载、NDJSON 流等）。 */
export const RAW_KEY = 'lcm:raw-response';

export function Raw(): MethodDecorator {
  return SetMetadata(RAW_KEY, true);
}
