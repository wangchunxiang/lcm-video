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
import MergeRules from '../views/collect/MergeRules.vue';
import SourceRules from '../views/collect/SourceRules.vue';
import Sources from '../views/collect/Sources.vue';
import Tasks from '../views/collect/Tasks.vue';
import SiteSetting from '../views/setting/Site.vue';
import AccountSetting from '../views/setting/Account.vue';
import MergeTools from '../views/tools/Merge.vue';
import CoverCheck from '../views/tools/CoverCheck.vue';
import PlayLines from '../views/playback/Lines.vue';
import PlaybackSetting from '../views/playback/Config.vue';

const implemented: Record<string, Component> = {
  '/collect/sources': Sources,
  '/collect/rules': SourceRules,
  '/collect/mapping': Mappings,
  '/collect/merge': MergeRules,
  '/collect/tasks': Tasks,
  '/collect/logs': Logs,
  '/content/vods': Vods,
  '/content/categories': Categories,
  '/setting/site': SiteSetting,
  '/setting/account': AccountSetting,
  '/tools/merge': MergeTools,
  '/tools/cover-check': CoverCheck,
  '/playback/lines': PlayLines,
  '/playback/config': PlaybackSetting,
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
      { path: 'setting', redirect: '/setting/site' },
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
