/**
 * PM2 启动配置：生产环境用 `pm2 start ecosystem.config.cjs` 守护。
 *
 * 前置：`npm ci && npm run build` —— 服务端产出 `apps/server/dist/main.js`，
 * 两个前端的 `dist` 由服务端托管（后台 /admin/、前台 /）。
 *
 * 环境变量从仓库根的 `.env` 读（Node 的 `--env-file`），不写死在配置里。
 */
const { join } = require('node:path');

module.exports = {
  apps: [
    {
      name: 'lcm-video',
      // 服务端的 start 脚本按 apps/server 为 cwd 读 ../../.env，这里保持一致
      cwd: join(__dirname, 'apps/server'),
      script: 'dist/main.js',
      interpreter: 'node',
      node_args: '--env-file=../../.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },
      out_file: join(__dirname, 'logs', 'out.log'),
      error_file: join(__dirname, 'logs', 'error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};