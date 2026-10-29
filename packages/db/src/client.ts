import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema.ts';

export interface DbOptions {
  /** 开启 MySQL 协议压缩：大结果集省带宽，小查询有少量 CPU 开销 */
  compress?: boolean;
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
}

export function createDb(config: DbConfig, options: DbOptions = {}) {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit ?? 10,
    waitForConnections: true,
    charset: 'utf8mb4',
    timezone: '+08:00',
    supportBigNumbers: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    compress: options.compress ?? false,
  });

  const db = drizzle(pool, { schema, mode: 'default' });

  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
