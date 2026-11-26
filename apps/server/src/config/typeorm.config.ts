import type { DataSourceOptions, Logger as TypeOrmLogger } from 'typeorm';
import { ENTITIES } from '../database/entities';
import { MIGRATIONS } from '../database/migrations/index';

/** 解析 `mysql://user:pass@host:port/db`。密码里可能有 `@`、`:`，必须走 URL 解码。 */
export function parseDatabaseUrl(url: string): {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
} {
  if (url.trim() === '') throw new Error('DATABASE_URL 未配置');
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port === '' ? 3306 : parsed.port),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    // 库名里可能有连字符（lcm-video），不能被当成路径分隔
    database: parsed.pathname.replace(/^\//, ''),
  };
}

/**
 * Nest 与 CLI 共用的连接参数（MySQL / MariaDB）。
 *
 * - `timezone: '+08:00'`：DateTime 列按北京时间解释与写入，直接查库看到的就是本地时间。
 *   接口再把 Date 序列化成带 `Z` 的 ISO，浏览器按本地时区展示，两端时刻一致。
 *   依赖 MySQL 会话时区也是 `+08:00`（否则 `DEFAULT CURRENT_TIMESTAMP` 会写 UTC）：
 *   实例级用 `SET GLOBAL time_zone = '+08:00'`，持久化写 my.cnf 的 `default-time-zone`。
 * - `synchronize: false`：结构变更一律走迁移，禁止按实体差异自动改表。
 * - `migrationsRun: true`：启动时自动执行未应用的迁移。空库因此会直接建出全部表
 *   （表注释、字段注释都在迁移 SQL 里），已经建过的库只跳过、不会重复执行。
 * - 不设 `supportBigNumbers/bigNumberStrings`：TypeORM 的 mysql 驱动默认就是 true/true，
 *   BIGINT 列因此以字符串返回（见 `AppBaseEntity` 的说明）。
 */
/**
 * 只报慢查询的 TypeORM logger：其它级别全部静默。
 * 不用 `logging: ['query']`：它会把每一条 SQL 都打出来，日志被淹没。
 */
function slowQueryLogger(options: SlowQueryOptions): TypeOrmLogger {
  return {
    logQuery() {},
    logQueryError() {},
    logQuerySlow(time: number, query: string) {
      // SQL 里的换行与缩进压平，一行日志能直接 grep 到
      options.log(`[slow-query] ${time}ms ${query.replace(/\s+/g, ' ').trim()}`);
    },
    logSchemaBuild() {},
    logMigration() {},
    log() {},
  };
}

export interface SlowQueryOptions {
  /** 超过这个耗时（ms）的 SQL 打一条 [slow-query] 日志 */
  slowQueryMs: number;
  log: (message: string) => void;
}

export function createDataSourceOptions(
  url: string,
  slowQuery?: SlowQueryOptions,
): DataSourceOptions {
  return {
    type: 'mysql',
    ...parseDatabaseUrl(url),
    charset: 'utf8mb4_unicode_ci',
    timezone: '+08:00',
    synchronize: false,
    migrationsRun: true,
    logging: false,
    // 只在配了 SLOW_QUERY_MS 时才挂 logger：默认不产生任何额外开销
    ...(slowQuery === undefined
      ? {}
      : { logger: slowQueryLogger(slowQuery), maxQueryExecutionTime: slowQuery.slowQueryMs }),
    // 实体与迁移都是显式清单：glob 在 e2e（vitest + swc）下会 require 到 .ts，Node 解析不了装饰器
    entities: ENTITIES,
    migrations: MIGRATIONS,
  };
}
