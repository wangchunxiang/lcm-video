import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * e2e 专用配置：跑在真 MySQL 上，串行执行（共用一套 fixture 数据）。
 *
 * 用 swc 转译：esbuild 不产出 `design:paramtypes`，NestJS 的构造函数注入会拿到 undefined。
 * `main.ts` 的装配在 `test/e2e/helpers/app.ts` 里复刻，改那边记得同步。
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    include: ['apps/server/test/**/*.e2e-spec.ts'],
    environment: 'node',
    globalSetup: ['apps/server/test/e2e/global-setup.ts'],
    setupFiles: ['apps/server/test/e2e/test-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
