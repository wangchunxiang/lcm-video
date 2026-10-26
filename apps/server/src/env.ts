import { fileURLToPath } from 'node:url';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量：${name}`);
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`环境变量 ${name} 不是有效数字：${raw}`);
  return value;
}

/** 仓库根目录：apps/server/src -> ../../.. */
const rootDir = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '127.0.0.1',
  port: num('PORT', 3100),
  jwtSecret: required('JWT_SECRET'),
  paths: {
    rootDir,
    uploadDir: path.join(rootDir, 'uploads'),
    themesDir: path.join(rootDir, 'themes'),
  },
  db: {
    host: required('DB_HOST'),
    port: num('DB_PORT', 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME'),
    connectionLimit: num('DB_POOL_MAX', 10),
  },
};

export type Env = typeof env;

export const isDev = env.nodeEnv !== 'production';
