# lcm-video

影视采集与门户站，单仓库 npm workspaces（`@lcm/*`）。后端负责采集、管理与只读门户接口，另带管理后台和用户端前台。

![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6?logo=typescript&logoColor=white)

## 功能

- **采集**：按来源定时抓取、字段清洗、重复影片合并，任务与日志可在后台查看
- **管理后台**：影片、分类、采集源、播放线路、合并规则、站点配置、管理员
- **用户端**：首页推荐、分类浏览、搜索、详情与播放
- **部署**：单进程同时提供 API 和两个前端，数据库外置，镜像不打包数据

## 技术栈

| 模块 | 选型 |
| --- | --- |
| 后端 | NestJS 11 · TypeORM 0.3 · `@ackplus/nest-crud` · pino |
| 数据库 | MySQL / MariaDB |
| 管理后台 | Vue 3 · Element Plus · Vite |
| 用户端 | Vue 3 · Vue Router · Vite |
| 工程 | TypeScript · ESLint · Vitest · turbo |

接口约定：HTTP 状态恒为 `200`，业务结果看响应体 `code`（`0` 成功）；分页用 `take` / `skip`，返回 `{ items, total }`。详见 [架构总览](docs/01-架构/架构总览.md)。

## 快速开始

### Docker（推荐）

需要一台 MySQL / MariaDB，并准备好 `.env`：

```bash
cp .env.example .env
# 必填：DATABASE_URL、JWT_SECRET（openssl rand -hex 32）
# 使用已发布的镜像：
# APP_IMAGE=docker.io/<用户名>/lcm-video:latest

docker compose pull
docker compose up -d
```

没有现成镜像时，本地构建后同样用 compose 启动：

```bash
npm run docker:export   # 生成 lcm-video.tar，导入 Docker 后 compose up -d
```

打开 `http://localhost:3100/`，后台在 `/admin/`。首次连接空库会自动建表并补齐分类、站点配置；`.env` 里配了 `ADMIN_PASSWORD` 时会创建管理员。

### 本地开发

要求 Node >= 24。

```bash
npm install
cp .env.example .env
npm run dev
```

| 应用 | 地址 |
| --- | --- |
| 前台 | http://localhost:3300 |
| 后台 | http://localhost:3200/admin/ |
| 接口 | http://localhost:3100 |

两个 Vite 开发服务器都会把 `/api` 代理到 3100。

## 环境变量

完整说明见 `.env.example`。

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 必填，`mysql://用户:密码@主机:3306/lcm_video` |
| `JWT_SECRET` | 必填，至少 16 字符 |
| `PORT` | 服务端口，默认 `3100` |
| `TZ` | 默认 `Asia/Shanghai` |
| `SEED_ON_START` | 空库启动时是否导入分类/配置，默认 `true` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 空库首次启动创建管理员，密码 6~50 位 |
| `APP_IMAGE` | compose 使用的镜像地址 |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` |
| `SLOW_QUERY_MS` | 慢查询日志阈值（毫秒） |

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 同时启动 server / admin / web |
| `npm run build` | 构建 shared、server、admin、web |
| `npm run check` | typecheck + lint + test + build |
| `npm test` | 单元测试 |
| `npm run test:e2e` | 真实数据库端到端测试 |
| `npm run db:migrate` | 手动执行迁移（启动时也会自动执行） |
| `npm run db:seed` | 导入初始数据 |
| `npm run docker:export` | 构建镜像并导出 `lcm-video.tar` |

## 项目结构

```
apps/
  server/      NestJS 后端，API + 定时采集
  admin/       管理后台
  web/         用户端前台
packages/
  shared/      共享枚举、类型与纯函数
  api-client/  前端请求层（信封解包、查询协议）
docs/          架构、数据库、前端、部署文档
```

## 部署注意

- **只跑单副本**：验证码、登录失败计数、定时任务都在进程内存里
- **数据库时区设为 `+08:00`**，时间列按北京时间存储
- 数据库与 `.env` 都不进镜像，容器重建不丢数据
- 构建产物存在时，`/admin/` 与 `/` 由后端直接托管

完整步骤（GitHub Actions、fnOS 导入、空库初始化、旧库迁移）见 [部署说明](docs/04-部署/部署说明.md)。

## 文档

- [架构总览](docs/01-架构/架构总览.md)
- [数据库设计](docs/02-数据库/数据库设计.md)
- [前端样式规范](docs/03-前端/样式规范.md)
- [部署说明](docs/04-部署/部署说明.md)
- [docs 目录说明](docs/README.md)
