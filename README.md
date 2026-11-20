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

接口约定见 [docs/01-架构/架构总览.md](docs/01-架构/架构总览.md)：HTTP 状态恒为 200，业务结果看 `code`（`0` 为成功）；
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
  admin/               管理后台（dev 与生产都在 /admin/ 下：dev http://localhost:3200/admin/）
  web/                 用户端前台（dev 3300，生产挂在根路径）
packages/
  shared/              共享契约：enums/ 枚举、types/ 纯类型、cron / html / vod / url-rule / settings / util
  api-client/          http.ts（统一信封、错误码、Bearer token）+ query-builder.ts（nest-crud 协议）
docs/                  文档目录，入口见 docs/README.md（01-架构 / 02-数据库 / 03-前端）
```

## 快速开始

要求 Node >= 24（`engines` 已声明）。

```bash
npm install
cp .env.example .env        # 填 DATABASE_URL、JWT_SECRET 等
npm run db:seed             # 可选：导入初始分类 / 站点配置 / 管理员账号
npm run dev                 # 同时起 server(3100) / admin(3200) / web(3300)
```

开发地址：前台 `http://localhost:3300`，后台 `http://localhost:3200/admin/`（与生产的 `/admin/`
前缀一致），接口由两个 vite 的 `/api` 代理转发到 3100。

空库不用手工建表：服务端启动时自动执行未应用的迁移（`migrationsRun: true`），
首个迁移是 baseline，按实体建出 15 张表并带上表注释与字段注释；之后按需增量迁移
（目前新增了 `lcm_vod_merge_rule`），已经建好的库只会跳过。
老库（有表、没有 `migrations` 记录，早期 `db:init` 建的）启动时会被自动登记为已迁移，不会重复建表。

时间列按**北京时间**存（TypeORM `timezone: '+08:00'`），直接查库看到的就是本地时间。
这要求 MySQL 会话时区也是 `+08:00`：实例上执行 `SET GLOBAL time_zone = '+08:00'`，
持久化写 my.cnf 的 `default-time-zone='+08:00'`；否则 `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE`
仍按服务器时区（常见是 UTC）写入，与应用写入的时间差 8 小时。

首次建库后没有管理员账号：`npm run db:seed` 可导入 `apps/server/src/database/seeds/*.sql`，
但这些种子的内容待校对，建议从已有库 `mysqldump` 出 `lcm_admin_user` / `lcm_category` / `lcm_setting` 三张表替换。

从 v2 旧库搬数据用 `npm run db:import-legacy`：默认连同一实例的 `lcm_video` 库，
跨实例时设 `LEGACY_DATABASE_URL`。脚本逐表按主键分批搬运，处理了改名
（`lcm_collect_log` → `lcm_collect_task_log`）、删列（`vod.letter`、`collect_source.api_format`）、
状态值重排（日志 0/1/2/3 → 1/2/3/4，任务 1/2 → 2/3）、`merge_ignore.kind` 由字符串改数字，
并把 `lcm_setting.merge_rules` 的 JSON 拆成 `lcm_vod_merge_rule` 的行。先 `-- --dry-run` 看行数，
确认后加 `-- --force`（目标表已有测试数据时再加 `-- --truncate`）。
大表逐批拉到 Node 再写回很慢，所以另外提供了 `-- --fast-copy`：旧库与新库在同一个 MySQL 实例时，
让服务端直接 `INSERT … SELECT` 复制（30 万行线路约 30 秒）；需要逐行转换的表（影片的上映日期、
日志状态、配置键过滤）仍走 Node 路径。只补某几张表用 `-- --tables=lcm_vod_play,lcm_setting`。

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
| `npm run db:import-legacy` | 从 v2 旧库 `lcm_video` 导入数据（`-- --dry-run` 只统计，`-- --force` 写库，`-- --truncate` 先清空，`-- --fast-copy` 同实例服务端复制，`-- --tables=a,b` 只搬指定表） |

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

### 方式一：PC 构建 → 飞牛 NAS 导入（推荐）

镜像在 PC 上构建，NAS 只负责跑容器；迭代时重复「导出 → 导入 → 重建应用」即可。
仓库根的 `docker-compose.yml` 只启动应用，数据库用 NAS 上已有的 MariaDB/MySQL，
通过 `.env` 的 `DATABASE_URL` 连接；NAS 上只需要这个文件和 `.env`。

PC（仓库根目录，需 Docker Desktop / Docker Engine）：

```bash
npm run docker:export     # docker build -t lcm-video:latest . + docker save -o lcm-video.tar
```

Apple Silicon 等 ARM 机器要给 x86 NAS 构建时，显式指定平台：

```bash
docker build --platform linux/amd64 -t lcm-video:latest .
docker save lcm-video:latest -o lcm-video.tar
```

NAS：

1. fnOS「Docker → 镜像 → 导入」选择 `lcm-video.tar`。
2. 新建部署目录（例：`/vol1/1000/docker/lcm-video`），放入仓库的 `docker-compose.yml`，
   再把 `.env.example` 复制成同目录的 `.env`，填好 `JWT_SECRET` 与 `DATABASE_URL`。
   `DATABASE_URL` 的主机名按数据库的部署方式选：
   - 数据库容器已映射 3306：用 `NAS局域网IP`
   - 数据库容器没映射端口：加入它的 Docker 网络后用容器名（见 `docker-compose.yml` 末尾注释）
   - 数据库装在 NAS 宿主机：用 `host.docker.internal`
3. fnOS「Docker → Compose → 新建项目」选该目录启动；或 SSH 进去
   `cd /vol1/1000/docker/lcm-video && docker compose up -d`。
4. 打开 `http://NAS局域网IP:3100/`，后台在 `/admin/`。

迭代发版（PC 改完代码后）：

```bash
npm run docker:export
# 把新的 lcm-video.tar 再导入一次，然后在 NAS 上重建应用容器：
docker compose up -d --force-recreate app
```

容器启动时会自动执行迁移建表，数据仍在已有数据库里，重建应用不会丢数据。
空库没有管理员账号，先按下节初始化。

### 首次初始化管理员

镜像运行阶段只带 `dist`，不含 `src/database/seeds/*.sql`，所以容器内不能直接 `npm run db:seed`。二选一：

**从已有库导入（推荐）**

```bash
mysqldump -h 旧地址 -u用户 -p --single-transaction lcm_video > lcm.sql
# 数据库也是容器时（数据库装在宿主机就改用宿主机的 mysql/mariadb 命令）：
docker exec -i <数据库容器名> mariadb -u<用户> -p'<密码>' lcm_video < lcm.sql
```

**新建一个管理员**：先生成 scrypt 哈希（Git Bash / NAS shell）

```bash
node -e "const c=require('node:crypto');const s=c.randomBytes(16).toString('hex');const h=c.scryptSync('改成你的密码',s,32,{N:16384,r:8,p:1}).toString('hex');console.log(['scrypt',16384,8,1,s,h].join('$'))"
```

把哈希写进 SQL 文件再导入（应用至少启动过一次、迁移建表之后）。
哈希里的 `$` 不能经过 shell 展开，所以走文件而不是 `-e`：

```bash
cat > insert-admin.sql <<'SQL'
INSERT INTO lcm_admin_user (id, username, password, nickname, is_enabled, password_version)
VALUES (1, 'admin', '<上一步的哈希>', '管理员', 1, 0);
SQL
docker exec -i <数据库容器名> mariadb -u<用户> -p'<密码>' lcm_video < insert-admin.sql
rm insert-admin.sql
```

登录后立刻在后台改密码。

### 方式二：PM2

```bash
npm ci && npm run build
pm2 start ecosystem.config.cjs
```

### 说明

- 数据库与 `.env` 都不进镜像。
- compose 只起应用，数据库用 NAS 上已有的实例；`DATABASE_URL` 的主机名按上文的三种情况选。
- 只跑单副本：验证码、登录失败计数、定时采集都在进程内存里，多副本会出问题（见 `docker-compose.yml` 顶部注释）。
- 时间列按北京时间存，已有 MariaDB 必须把时区设成 `+08:00`（`--default-time-zone=+08:00` 或实例配置），否则差 8 小时。

## 当前状态

- 服务端（v3，TypeORM）：CRUD、采集任务、门户只读接口 `/api/web/*`、重复影片合并已完成，真库冒烟通过。
- 管理后台：已对接 v3（Bearer token 存 localStorage、`take` / `skip` 分页、`where` / `order` JSON 过滤、camelCase 字段、`PUT` 更新）；`vue-tsc` 纳入 `npm run typecheck`。
- 用户端前台：仅骨架（路由 + 五个占位页 + `/api/web` 客户端），样式与播放器待做。
- 文档：`docs/01-架构/架构总览.md` 与 `docs/02-数据库/数据库设计.md` 已对齐 TypeORM 实现；v1 遗留方案（Fastify + LiquidJS）的文档已删除。
