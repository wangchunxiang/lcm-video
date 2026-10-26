# 蓝草莓影视 · 生产镜像
#
# 服务端直接跑 TypeScript（Node 24 原生类型擦除），镜像里只额外构建后台静态资源。
# 数据库不打包进镜像，用 .env / 环境变量指向外部 MySQL。

FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Shanghai

# 先只拷贝依赖清单，命中缓存
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

# 再拷源码与资源
COPY tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY themes ./themes

# 构建后台管理界面（输出 apps/admin/dist，由服务端挂到 /admin）
RUN npm run build

EXPOSE 3100

CMD ["npm", "run", "start"]
