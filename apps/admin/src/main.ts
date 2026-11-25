import { createApp } from 'vue';
// Element Plus 样式一次性整包引入（组件本身仍由 unplugin-vue-components 按需注入）。
// 不能用「按组件引 style/css」：模板里每个 <el-xxx> 都会变成一条裸依赖，Vite 要等
// 懒加载路由第一次被点开才发现新的样式包，当场重新预打包 + 整页刷新。
// 必须排在 global.css 之前：global.css 里用到 var(--el-text-color-primary) 等变量，
// 并且要能覆盖 Element Plus 的默认样式。
import 'element-plus/dist/index.css';
import './styles/global.css';
import App from './App.vue';
import router from './router/index.ts';
import { setUnauthorizedHandler } from './session.ts';

const app = createApp(App);

// token 失效交给 router 跳登录：`redirect` 参数与路由守卫里的 `to.fullPath` 同一种格式，
// 登录页拿到的永远是 router 能直接用的路径，不需要再剥 BASE_URL。
setUnauthorizedHandler(() => {
  const current = router.currentRoute.value.fullPath;
  if (current.startsWith('/login')) return;
  void router.replace({ path: '/login', query: { redirect: current } });
});

app.use(router);
app.mount('#app');
