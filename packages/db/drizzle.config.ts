import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
const env: Record<string, string> = {};
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
} catch {
  // .env 不存在时只用进程环境变量
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    host: process.env.DB_HOST ?? env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? env.DB_NAME ?? 'lcm_video',
  },
});
