# lcm-video

影视采集站：后端采集/管理接口 + 管理后台 + 用户端前台，npm workspaces 单仓（`@lcm/*` 命名空间）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11 + TypeORM 0.3 + `@ackplus/nest-crud`，单进程（HTTP + 定时采集任务） |
| 数据库 | MySQL / MariaDB，BIGINT 主键在 JS 侧一律按 string 处理 |
| 管理后台 | Vue 3 + Element Plus + Vite |
| 用户端前台 | Vue 3 + Vue Router + Vite |
| 共享包 | `@lcm/shared` 纯契约（CJS 产物）、`@lcm/api-client` 请求层（纯 TS 源码） |
| 质量门 | TypeScript + ESLint + Vitest，turbo 负责构建顺序 |

接口约定见 [docs/架构-v2.md](docs/架构-v2.md)：HTTP 状态恒为 200，业务结果看 `code`（`0` 为成功）；
列表分页直接用 nest-crud 的 `take` / `skip`，响应 `data = { items, total }`。

## 目录

```
apps/
  server/              NestJS 后端（PORT 默认 3100）
    src/
      main.ts          入口：helmet / compression / 全局管道与拦截器
      app.module.ts    根模块：配置、TypeORM、pino、定时任务、业务模块
      common/          crud 基类、装饰器、过滤器、守卫、拦截器、管道、安全工具
      config/          configuration.ts / validation.schema.ts / typeorm.config.ts
      database/        data-source.ts、migrate.ts、seed.ts、reset.ts、migrations/、seeds/
      modules/         一表一模块，CRUD 由 @AppCrud() 生成；另有 collect、portal、health 等无表模块
    test/              集成测试（e2e）预留；单测与源码同目录，跑 vitest
  admin/               管理后台（dev 3200，build 到 /admin/）
  web/                 用户端前台（dev 3300），页面目前为占位实现
packages/
  shared/              共享契约：enums/ 枚举、types/ 纯类型、cron / html / vod / url-rule / settings / util
  api-client/          http.ts（统一信封、错误码、Bearer token）+ query-builder.ts（nest-crud 协议）
docs/                  架构、数据库设计、功能对齐与样式规范
```

## 快速开始

要求 Node >= 24（`engines` 已声明）。

```bash
npm install
cp .env.example .env        # 填 DATABASE_URL、JWT_SECRET 等
npm run db:seed             # 可选：导入初始分类 / 站点配置 / 管理员账号
npm run dev                 # 同时起 server(3100) / admin(3200) / web(3300)
```

空库不用手工建表：服务端启动时自动执行未应用的迁移（`migrationsRun: true`），
首个迁移是 baseline，按实体建出 15 张表并带上表注释与字段注释；已经建好的库只会跳过。
老库（有表、没有 `migrations` 记录，早期 `db:init` 建的）启动时会被自动登记为已迁移，不会重复建表。

首次建库后没有管理员账号：`npm run db:seed` 可导入 `apps/server/src/database/seeds/*.sql`，
但这些种子的内容待校对，建议从已有库 `mysqldump` 出 `lcm_admin_user` / `lcm_category` / `lcm_setting` 三张表替换。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 并行启动三个应用 |
| `npm run dev:server` / `dev:admin` / `dev:web` | 单独启动 |
| `npm run build` | `turbo run build`：shared 先构建，再并行打包 server / admin / web |
| `npm run start` | 启动已构建的服务端（读根目录 `.env`） |
| `npm run typecheck` | 根 `tsc`（api-client）+ `turbo run typecheck`（server / shared / api-client） |
| `npm run check` | typecheck + lint + test + build，提交前跑这一个 |
| `npm run lint` | ESLint |
| `npm test` | Vitest（`packages/**` 与 `apps/**` 下的 `*.test.ts`） |
| `npm run test:e2e` | 真库端到端测试（`apps/server/test/**/*.e2e-spec.ts`），需要一个可用的 MySQL |
| `npm run db:migrate` | 手动执行未应用的迁移（启动时也会自动执行） |
| `npm run db:seed` | 导入 `src/database/seeds/*.sql`（`-- --dry-run` 只打印） |
| `npm run db:reset` | 开发用：DROP 全表后按迁移重建（需 `-- --force`） |

## 环境变量

见 `.env.example`。服务端用 `@nestjs/config` 装载并校验，缺关键变量会启动失败。

## 端到端测试

`npm run test:e2e` 在真 MySQL 上跑完整 HTTP 链路（登录、CRUD、门户只读接口），
装配方式复刻 `apps/server/src/main.ts`，所以管道 / 拦截器 / 过滤器测的就是线上行为。

- 测试库由 `TEST_DATABASE_URL` 指定；不配就把 `DATABASE_URL` 的库名加 `_test` 后缀。
  库名不以 `_test` 结尾会直接拒绝运行，避免误连开发库。
- 每次运行会先清空测试库的表，再由应用启动时的迁移重新建表 —— 跑之前不用手工准备结构。
- 依赖 swc 转译（esbuild 不产出 `design:paramtypes`，NestJS 的构造注入会拿到 undefined），
  配置在 `vitest.e2e.config.ts`。
- 用例共用一套 fixture 数据，因此串行执行（`fileParallelism: false`），一次约 10 秒。

## 部署

单进程同时提供 API 与两个前端（决策 7.3）：构建产物存在时，`/admin/` 由 `apps/admin/dist` 托管、
`/` 由 `apps/web/dist` 托管，history 路由回落到各自的 `index.html`；产物不存在则跳过（开发时各跑 vite dev server）。

```bash
# 方式一：Docker（两阶段构建，运行阶段只带 prune 后的依赖与 dist）
docker build -t lcm-video .
docker run -p 3100:3100 --env-file .env lcm-video

# 方式二：PM2
npm ci && npm run build
pm2 start ecosystem.config.cjs
```

数据库与 `.env` 都不进镜像；容器启动后自动执行迁移建表（见「快速开始」）。

## 当前状态

- 服务端（v3，TypeORM）：CRUD、采集任务、门户只读接口 `/api/site/*`、重复影片合并已完成，真库冒烟通过。
- 管理后台：已对接 v3（Bearer token 存 localStorage、`take` / `skip` 分页、`where` / `order` JSON 过滤、camelCase 字段、`PUT` 更新）；`vue-tsc` 纳入 `npm run typecheck`。
- 用户端前台：仅骨架（路由 + 五个占位页 + `/api/site` 客户端），样式与播放器待做。
- 文档：`docs/架构-v2.md` 与 `docs/数据库设计-v2.md` 已对齐 TypeORM 实现；`docs/技术方案.md` 是 v1 遗留方案（Fastify + LiquidJS），开头已标注过时，只当产品范围参考。
