import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

/** 启动时必须存在的环境变量，缺一个就起不来（决策 1.4）。 */
class EnvVariables {
  @IsIn(['development', 'production', 'test'], { message: 'NODE_ENV 只能是 development / production / test' })
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt({ message: 'PORT 必须是整数' })
  @Min(1, { message: 'PORT 必须大于 0' })
  PORT: number = 3100;

  @IsString()
  @MinLength(1, { message: 'DATABASE_URL 未配置' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET 至少要 16 个字符' })
  JWT_SECRET!: string;

  /** 慢查询阈值（毫秒），超过就记一条 warn 日志 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  SLOW_QUERY_MS?: number;
}

/** 交给 ConfigModule 的 validate，校验失败直接抛错终止进程。 */
export function validateEnv(config: Record<string, unknown>): EnvVariables {
  const instance = plainToInstance(EnvVariables, config, { exposeDefaultValues: true });
  const errors = validateSync(instance, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const detail = errors
      .map((error) => Object.values(error.constraints ?? {}).join('；'))
      .filter((text) => text.length > 0)
      .join('；');
    throw new Error(`环境变量校验失败：${detail}`);
  }
  return instance;
}
