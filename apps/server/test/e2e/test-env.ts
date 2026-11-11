import { existsSync } from 'node:fs';

/**
 * e2e 的运行环境。必须在 `AppModule` 被 import 之前执行，
 * 所以它是 vitest 的 `setupFiles`，而不是某个测试文件里的 `beforeAll`。
 *
 * 数据库优先取 `TEST_DATABASE_URL`；没配就把 `DATABASE_URL` 的库名加 `_test` 后缀。
 */
function withTestSuffix(url: string): string {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  // 幂等：重复求值（globalSetup 与测试文件各一份模块图）时不要越加越长
  if (name.endsWith('_test')) return url;
  parsed.pathname = `/${name}_test`;
  return parsed.toString();
}

export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit !== undefined && explicit !== '') return explicit;

  const base = process.env.DATABASE_URL;
  if (base === undefined || base === '') {
    throw new Error('e2e 需要 TEST_DATABASE_URL 或 DATABASE_URL');
  }
  return withTestSuffix(base);
}

/** 只允许操作名字以 `_test` 结尾的库，防止手滑连上开发库或生产库。 */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`拒绝在非测试库上跑 e2e：${name}（库名必须以 _test 结尾）`);
  }
}

// vitest 不会把 .env 注入 process.env，这里按需读一次
if (process.env.DATABASE_URL === undefined && existsSync('.env')) {
  process.loadEnvFile('.env');
}

process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET ??= 'e2e-secret';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';
