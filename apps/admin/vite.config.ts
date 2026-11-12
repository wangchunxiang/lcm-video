import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [vue()],
  // @lcm/shared 的入口指向 CommonJS 构建产物，dev 下让 Vite 预打包以提供 ESM 命名导出
  optimizeDeps: { include: ['@lcm/shared/cron'] },
  build: {
    // @lcm/shared 是 CommonJS 编译产物（供服务端 require），打包时需交给 commonjs 插件处理
    commonjsOptions: { include: [/node_modules/, /packages[\\/]shared/] },
  },
  server: {
    port: 3200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: false,
      },
    },
  },
}));
