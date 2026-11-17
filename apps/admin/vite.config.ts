import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  // 开发与生产都挂在 /admin/ 下：开发访问 http://localhost:3200/admin/，
  // 生产由服务端把 admin/dist 挂到 /admin/，两边路由与资源前缀一致
  base: '/admin/',
  plugins: [
    vue(),
    // 按需引入 Element Plus：只打包模板里真正用到的组件，样式也跟着组件走
    Components({
      resolvers: [ElementPlusResolver({ importStyle: 'css' })],
      // 不生成 components.d.ts：生成后 el-table 的插槽会按 DefaultRow 校验，
      // 与各页面 `row: XxxRow` 的用法冲突（109 处）；这些组件本来就只在模板里用。
      dts: false,
    }),
  ],
  // @lcm/shared 的入口指向 CommonJS 构建产物，dev 下让 Vite 预打包以提供 ESM 命名导出
  optimizeDeps: { include: ['@lcm/shared/cron'] },
  build: {
    // @lcm/shared 是 CommonJS 编译产物（供服务端 require），打包时需交给 commonjs 插件处理
    commonjsOptions: { include: [/node_modules/, /packages[\\/]shared/] },
  },
  server: {
    port: 3200,
    strictPort: true,
    // 默认只监听 localhost，手机/平板访问局域网 IP 打不开；这里显式监听所有网卡
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: false,
      },
    },
  },
});
