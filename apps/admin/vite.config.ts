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
    // 按需引入 Element Plus：只打包模板里真正用到的组件。
    // 样式不走「按组件引 style/css」：那样模板里每个 <el-xxx> 都会变成一条裸依赖
    // (element-plus/es/components/xxx/style/css)，Vite 要等懒加载路由第一次被点开才
    // 发现新的样式包，当场重新预打包并强制整页刷新。中途重新预打包还会让页面里
    // 同时存在两个 ?v= 代际的 Vue 副本，渲染时报
    // "Cannot read properties of null (reading 'ce')"（renderSlot 读到空 currentRenderingInstance）。
    // 改为 main.ts 一次性引整包 CSS（361 KB，装了的组件全覆盖）。
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      // 不生成 components.d.ts：生成后 el-table 的插槽会按 DefaultRow 校验，
      // 与各页面 `row: XxxRow` 的用法冲突（109 处）；这些组件本来就只在模板里用。
      dts: false,
    }),
  ],
  // @lcm/shared 的入口指向 CommonJS 构建产物，dev 下让 Vite 预打包以提供 ESM 命名导出。
  // 下面这些依赖只被按需加载的页面引用（hls.js → 播放配置页，图标库 → 各业务页）：
  // 不写进这里的话，Vite 要等你第一次点进那个页面才发现它，然后当场重新预打包并强制
  // 整页刷新（控制台会打 "new dependencies optimized" + "page reload"，表现为点菜单
  // 时整屏白一下）。列全之后首次点任何菜单都不会再触发重新预打包。
  optimizeDeps: {
    include: [
      '@lcm/shared/cron',
      'hls.js',
      '@element-plus/icons-vue',
      'element-plus',
      'element-plus/es/locale/lang/zh-cn',
    ],
  },
  build: {
    // @lcm/shared 是 CommonJS 编译产物（供服务端 require），打包时需交给 commonjs 插件处理
    commonjsOptions: { include: [/node_modules/, /packages[\\/]shared/] },
  },
  server: {
    port: 3200,
    strictPort: true,
    // 默认只监听 localhost，手机/平板访问局域网 IP 打不开；这里显式监听所有网卡
    host: true,
    // 启动时预转换全部源码：View 都是懒加载的，预热能顺手把它们的依赖在第一轮
    // 预打包里发现完，避免「点第二个菜单时服务器又优化一次」的窗口期。
    // 代价是 dev 启动多 1~2 秒，换来第一次点菜单就不再整页刷新。
    warmup: { clientFiles: ['./src/**/*.vue', './src/**/*.ts'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: false,
      },
    },
  },
});
