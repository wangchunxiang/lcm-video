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
      app.module.ts    根模块：配置、TypeORM、pino、定时任务、18 个业务模块
      common/          crud 基类、装饰器、过滤器、守卫、拦截器、管道、安全工具
      config/          环境变量装载与校验（env.ts）
      database/        data-source.ts、options.ts、migrations/
      jobs/            采集（collect）、广告（ads）、封面体检（covers）
      modules/         一表一模块，CRUD 由 @Crud() 生成
    scripts/           init-db.cjs 等运维脚本
  admin/               管理后台（dev 3200，build 到 /admin/）
  web/                 用户端前台（dev 3300），页面目前为占位实现
packages/
  shared/              前后端共享契约：cron / html / vod / url-rule / settings / util
  api-client/          http.ts（统一信封、错误码、Bearer token）+ query-builder.ts（nest-crud 协议）
  db/                  仅保留 seed/*.sql（v2 的 Prisma/drizzle 层已退役）
docs/                  架构、数据库设计、功能对齐与样式规范
themes/                老站的模板资源（前台重写前保留）
```

## 快速开始

要求 Node >= 24（`engines` 已声明）。

```bash
npm install
cp .env.example .env        # 填 DATABASE_URL、JWT_SECRET 等
npm run db:init             # 按 TypeORM 迁移建表
npm run dev                 # 同时起 server(3100) / admin(3200) / web(3300)
```

首次建库后没有管理员账号：`packages/db/seed/*.sql` 目前没有应用脚本，且内容待校对，
建议从已有库 `mysqldump` 出 `lcm_admin_user` / `lcm_category` / `lcm_setting` 三张表替换。

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
| `npm run db:init` | 执行迁移建表 |

## 环境变量

见 `.env.example`。服务端用 `@nestjs/config` 装载并校验，缺关键变量会启动失败。

## 当前状态

- 服务端（v3，TypeORM）：CRUD、采集任务、门户只读接口 `/api/site/*`、重复影片合并已完成，真库冒烟通过。
- 管理后台：页面齐全，但仍是 v2 契约（cookie 会话、`page` / `page_size` 分页），尚未对接 v3 的 Bearer token 与 `take` / `skip`。
- 用户端前台：仅骨架（路由 + 五个占位页 + `/api/site` 客户端），样式与播放器待做。
- 文档：`docs/` 中部分内容仍按 Prisma + drizzle 描述，与 TypeORM 实现不一致，待返工。
