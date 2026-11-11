# 集成测试（e2e）

单测跟被测代码放一起（`src/**/*.test.ts`，跑 vitest），这里只放需要起 Nest 容器、连真库的集成测试。

计划中的写法：`Test.createTestingModule({ imports: [AppModule] })` + `supertest`，不走真实端口，
用 `.env` 里的 `lcm-video` 库；采集解析/合并这类最怕回归的地方优先补。

现在还没建——补的时候先 `npm i -D supertest @types/supertest`，再按 `xxx.e2e-spec.ts` 命名，
并确认 `vitest.config.ts` 的 include 已经覆盖 `apps/**/*.e2e-spec.ts`（目前是 `apps/**/*.test.ts`，
需要一起改）。
