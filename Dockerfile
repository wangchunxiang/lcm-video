# 蓝草莓影视 · 生产镜像
#
# 单进程同时提供 API 与静态页面：后台挂 /admin/，前台挂 /。
# 数据库不打包进镜像，用环境变量指向外部 MySQL。

# ---- 构建阶段：装依赖，构建 shared / api-client / admin / web / server ----
FROM node:24-bookworm-slim AS build

WORKDIR /app

ENV NODE_ENV=development

# 先只拷依赖清单，命中缓存
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api-client/package.json packages/api-client/package.json

RUN npm ci

COPY turbo.json tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm run build

RUN npm prune --omit=dev && rm -f apps/server/dist/.tsbuildinfo

# ---- 运行阶段：只带运行时依赖与构建产物 ----
FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Shanghai

# Alpine 不带时区库，不装 tzdata 的话 TZ=Asia/Shanghai 不生效
RUN apk add --no-cache tzdata

# 运行阶段用不到包管理器，删掉减少体积
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/admin/dist ./apps/admin/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3100

# main.js 按 __dirname 找 ../admin/dist 与 ../web/dist，cwd 无所谓
CMD ["node", "apps/server/dist/main.js"]
