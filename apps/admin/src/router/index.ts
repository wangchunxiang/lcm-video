import { createRouter, createWebHistory } from 'vue-router';
import { flatMenus } from '../menu.ts';
import { auth, fetchMe } from '../auth.ts';

/**
 * 路由表：除登录页与布局外全部懒加载。
 * 播放设置（Config.vue）和重复影片（Merge.vue）单文件都接近 1000 行，
 * 静态 import 会把它们一并塞进首屏 chunk。
 */
const Login = () => import('../views/Login.vue');
const AdminLayout = () => import('../layout/AdminLayout.vue');

/** 菜单地址 → 页面组件。键与 `menu.ts` 里的叶子节点一一对应。 */
const pages: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../views/Dashboard.vue'),
  '/sources': () => import('../views/collect/Sources.vue'),
  '/source-rules': () => import('../views/collect/SourceRules.vue'),
  '/mappings': () => import('../views/collect/Mappings.vue'),
  '/merge-rules': () => import('../views/collect/MergeRules.vue'),
  '/tasks': () => import('../views/collect/Tasks.vue'),
  '/logs': () => import('../views/collect/Logs.vue'),
  '/vods': () => import('../views/content/Vods.vue'),
  '/categories': () => import('../views/content/Categories.vue'),
  '/site': () => import('../views/setting/Site.vue'),
  '/account': () => import('../views/setting/Account.vue'),
  '/merge': () => import('../views/tools/Merge.vue'),
  '/cover-check': () => import('../views/tools/CoverCheck.vue'),
  '/play-lines': () => import('../views/playback/Lines.vue'),
  '/player-settings': () => import('../views/playback/Config.vue'),
};

/** 菜单里登记了却还没实现的地址：留一个占位页，避免点进去是空白 */
const Missing = () => import('../views/Placeholder.vue');

const childRoutes = flatMenus().map((menu) => ({
  path: menu.path.replace(/^\//, ''),
  component: pages[menu.path] ?? Missing,
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
      ...childRoutes,
      // 兜底：手输错地址、或菜单项被删掉后回退，不该是一片空白
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('../views/NotFound.vue'),
        meta: { title: '页面不存在' },
      },
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
