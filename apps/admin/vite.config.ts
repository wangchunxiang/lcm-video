import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [vue()],
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
