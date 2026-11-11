import { createRouter, createWebHistory } from 'vue-router';

/**
 * 前台五个页面（技术方案：单站、PC 优先、纯游客，无登录）。
 * 路由与 `/api/site/*` 一一对应；页面目前是占位实现，业务待后续补齐。
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/list/:alias', name: 'list', component: () => import('../views/ListView.vue') },
    { path: '/detail/:id', name: 'detail', component: () => import('../views/DetailView.vue') },
    { path: '/play/:id', name: 'play', component: () => import('../views/PlayView.vue') },
    { path: '/search', name: 'search', component: () => import('../views/SearchView.vue') },
  ],
});
