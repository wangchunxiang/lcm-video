import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [vue()],
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
