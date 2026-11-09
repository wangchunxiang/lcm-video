import { z } from 'zod';

/** 启动时必须存在的环境变量，缺一个就起不来（决策 1.4）。 */
const EnvDTO = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 未配置'),
});

export type Env = z.infer<typeof EnvDTO>;

/** 交给 ConfigModule 的 validate，校验失败直接抛错终止进程。 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvDTO.safeParse(config);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`环境变量校验失败：${detail}`);
  }
  return result.data;
}
