# 集成测试（e2e）

单测跟被测代码放一起（`src/**/*.test.ts`，跑 `npm test`），这里放需要起 Nest 容器、连真库的端到端测试。

## 怎么跑

```bash
npm run test:e2e      # 根目录跑，约 10 秒
```

- 测试库：`TEST_DATABASE_URL`；不配就用 `DATABASE_URL` 的库名加 `_test` 后缀。
  库名不以 `_test` 结尾会被 `test-env.ts` 直接拒绝，防止误连开发库。
- 每次运行 `global-setup.ts` 先清空测试库的表，再让应用启动时的迁移重新建表。
- 用例共用一套 fixture（`helpers/fixtures.ts`：管理员、两级分类、一部影片、一条线路），
  所以 `fileParallelism: false` 串行跑。

## 结构

| 文件 | 作用 |
| --- | --- |
| `e2e/test-env.ts` | 解析测试库地址、设 `LOG_LEVEL=silent`，作为 vitest `setupFiles` 在 AppModule 之前执行 |
| `e2e/global-setup.ts` | 建库 + 清表（只用 mysql2，不引 TypeORM） |
| `e2e/helpers/app.ts` | 复刻 `main.ts` 的装配：强制 200 的中间件、`AppValidationPipe`、`ResponseInterceptor`、`AllExceptionsFilter` |
| `e2e/helpers/fixtures.ts` | 幂等插入测试数据 |
| `e2e/helpers/auth.ts` | 登录拿 token |
| `e2e/*.e2e-spec.ts` | 探活、鉴权、CRUD、门户四组用例 |

## 两个坑

- **必须用 swc 转译**（`vitest.e2e.config.ts`）：esbuild 不产出 `design:paramtypes`，
  NestJS 的构造注入会拿到 `undefined`。
- **实体 / 迁移不能走 glob**：`typeorm.config.ts` 里用的是显式清单
  （`src/database/entities.ts`、`src/database/migrations/index.ts`）。glob 会在运行时 `require`
  到 `.ts` 源码，而 Node 自带的类型擦除不支持装饰器，直接 `SyntaxError`。
  `src/database/entities.test.ts` 会检查新增的实体 / 迁移有没有漏登记。
