/**
 * PM2 启动配置：生产环境用 `pm2 start ecosystem.config.cjs` 守护。
 *
 * Node 24 直接跑 TypeScript（原生类型擦除），不需要编译服务端；
 * 只有后台管理界面需要 `npm run build` 产出静态文件。
 */
module.exports = {
  apps: [
    {
      name: 'lcm-video',
      cwd: __dirname,
      script: 'apps/server/src/index.ts',
      interpreter: 'node',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai'
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true
    }
  ]
};
