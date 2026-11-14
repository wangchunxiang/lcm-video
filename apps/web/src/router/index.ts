import { createRouter, createWebHistory } from 'vue-router';
import { defaultListAlias } from '../site';
/**
 * 前台五个页面（技术方案：单站、PC 优先、纯游客，无登录）。
 * 路由与 `/api/web/*` 一一对应；筛选与播放位置放在 query/params 上，便于直达与回退。
 */
export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      // 首页 hero 通栏，横向边界交给页面自己（见 App.vue）
      meta: { fullBleed: true },
    },
    { path: '/list', redirect: () => ({ name: 'list', params: { alias: defaultListAlias() } }) },
    {
      path: '/list/:alias',
      name: 'list',
      component: () => import('../views/ListView.vue'),
      // 没有「全部」聚合页了：老的 /list/all 和任何非分类别名都落到第一个一级分类
      beforeEnter: (to) => (to.params.alias === 'all' ? { name: 'list', params: { alias: defaultListAlias() }, query: to.query } : true),
    },
    {
      path: '/detail/:id',
      name: 'detail',
      component: () => import('../views/DetailView.vue'),
      // 顶部虚化横幅要通栏，横向边界交给页面自己（内部再用 Container 收内容）
      meta: { fullBleed: true },
    },
    { path: '/play/:id/:lineId?/:ep?', name: 'play', component: () => import('../views/PlayView.vue') },
    { path: '/search', name: 'search', component: () => import('../views/SearchView.vue') },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
});
