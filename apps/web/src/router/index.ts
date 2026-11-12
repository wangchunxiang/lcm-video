import { createRouter, createWebHistory } from 'vue-router';

/**
 * 前台五个页面（技术方案：单站、PC 优先、纯游客，无登录）。
 * 路由与 `/api/site/*` 一一对应；筛选与播放位置放在 query/params 上，便于直达与回退。
 */
export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/list', redirect: '/list/all' },
    { path: '/list/:alias', name: 'list', component: () => import('../views/ListView.vue') },
    { path: '/detail/:id', name: 'detail', component: () => import('../views/DetailView.vue') },
    { path: '/play/:id/:lineId?/:ep?', name: 'play', component: () => import('../views/PlayView.vue') },
    { path: '/search', name: 'search', component: () => import('../views/SearchView.vue') },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
});
