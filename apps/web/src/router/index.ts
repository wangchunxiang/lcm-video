import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteLocationRaw } from 'vue-router';
import { defaultListAlias, ensureSite } from '../site';

/** `/list` 与历史 `/list/all` 都落到第一个一级分类：先等分类树到位，否则会落到兜底别名 */
async function toDefaultList(to: RouteLocationNormalized): Promise<RouteLocationRaw> {
  await ensureSite();
  return { name: 'list', params: { alias: defaultListAlias() }, query: to.query };
}
/**
 * 前台五个页面（单站、PC 优先、纯游客，无登录）。
 * 路由与 `/api/web/*` 一一对应；筛选与播放位置放在 query/params 上，便于直达与回退。
 */
export const router = createRouter({
  history: createWebHistory(),
  /**
   * 换页回顶部；同一路由内只改参数/query 时按页面决定：
   * 详情页切线路、播放页切线路/选集时内容就在眼前，不该跳回顶部（浏览器/路由默认会回到 0）。
   */
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition;
    if (to.name === from.name && (to.name === 'detail' || to.name === 'play')) return false;
    return { top: 0 };
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      // 首页整页在 Container 里收边（见 App.vue）
      meta: { fullBleed: true },
    },
    {
      // 只用来重定向：等分类树到位后再跳到第一个一级分类
      path: '/list',
      name: 'list-root',
      component: () => import('../views/ListView.vue'),
      beforeEnter: (to) => toDefaultList(to),
    },
    {
      path: '/list/:alias',
      name: 'list',
      component: () => import('../views/ListView.vue'),
      // 没有「全部」聚合页了：老的 /list/all 落到第一个一级分类
      beforeEnter: async (to) => {
        if (to.params.alias !== 'all') return true;
        await ensureSite();
        return { name: 'list', params: { alias: defaultListAlias() }, query: to.query };
      },
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
