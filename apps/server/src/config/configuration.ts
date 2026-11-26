import type { EnvVariables } from './validation.schema';

/**
 * 校验通过后的配置快照。
 * 字段名与 `EnvVariables` 一一对应，只是换成驼峰，方便按 `app.port` 这样带命名空间地读。
 */
export interface AppConfig {
  nodeEnv: EnvVariables['NODE_ENV'];
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  slowQueryMs?: number;
  /** 分钟级耗时巡检告警阈值（ms）：p95 达到它才打日志，0 关闭整个巡检 */
  latencyLogMs: number;
}

/**
 * 从环境变量装载配置。
 *
 * 这里不再做校验——`validation.schema.ts` 的 `validateEnv` 已在 ConfigModule 初始化时跑过，
 * 走不到这一步的进程早就退出了。此函数只负责把散落的键收成一处带类型的对象。
 */
export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const slowQueryMs = Number(env.SLOW_QUERY_MS ?? '');
  // 生产日志是给人看的：默认只在慢或出错时说话，不刷屏
  const latencyLogMs = Number(env.LATENCY_LOG_MS ?? '500');
  return {
    nodeEnv: (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'],
    port: Number(env.PORT ?? 3100),
    databaseUrl: env.DATABASE_URL ?? '',
    jwtSecret: env.JWT_SECRET ?? '',
    slowQueryMs: Number.isFinite(slowQueryMs) && slowQueryMs > 0 ? slowQueryMs : undefined,
    latencyLogMs: Number.isFinite(latencyLogMs) && latencyLogMs >= 0 ? latencyLogMs : 500,
  };
}

/** 交给 `ConfigModule.forRoot({ load: [...] })`，注入侧即可 `config.getOrThrow('app.port')`。 */
export function configuration(): { app: AppConfig } {
  return { app: loadConfiguration() };
}
