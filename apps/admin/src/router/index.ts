import { createRouter, createWebHistory } from 'vue-router';
import type { Component } from 'vue';
import { flatMenus } from '../menu.ts';
import { auth, fetchMe } from '../auth.ts';
import Login from '../views/Login.vue';
import AdminLayout from '../layout/AdminLayout.vue';
import Dashboard from '../views/Dashboard.vue';
import Placeholder from '../views/Placeholder.vue';
import Categories from '../views/content/Categories.vue';
import Vods from '../views/content/Vods.vue';
import Logs from '../views/collect/Logs.vue';
import Mappings from '../views/collect/Mappings.vue';
import Sources from '../views/collect/Sources.vue';
import Tasks from '../views/collect/Tasks.vue';
import BaseSetting from '../views/setting/Base.vue';
import SiteSetting from '../views/setting/Site.vue';
import AccountSetting from '../views/setting/Account.vue';
import DataTools from '../views/tools/Data.vue';
import PlayLines from '../views/playback/Lines.vue';

const implemented: Record<string, Component> = {
  '/collect/sources': Sources,
  '/collect/mapping': Mappings,
  '/collect/tasks': Tasks,
  '/collect/logs': Logs,
  '/content/vods': Vods,
  '/content/categories': Categories,
  '/setting/base': BaseSetting,
  '/setting/site': SiteSetting,
  '/setting/account': AccountSetting,
  '/tools/data': DataTools,
  '/playback/lines': PlayLines,
};

const implementedRoutes = Object.entries(implemented).map(([path, component]) => ({
  path: path.replace(/^\//, ''),
  component,
  meta: { title: flatMenus().find((menu) => menu.path === path)?.title ?? '' },
}));

const placeholderRoutes = flatMenus()
  .filter((menu) => menu.path !== '/dashboard' && !(menu.path in implemented))
  .map((menu) => ({
    path: menu.path.replace(/^\//, ''),
    component: Placeholder,
    meta: { title: menu.title },
  }));

const routes = [
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: AdminLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: Dashboard, meta: { title: '数据概览' } },
      ...implementedRoutes,
      ...placeholderRoutes,
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${String(to.meta.title)} · 蓝草莓影视后台` : '蓝草莓影视后台';

  if (to.meta.public) return true;

  if (!auth.loaded) await fetchMe();
  if (!auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
