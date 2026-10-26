export interface MenuItem {
  path: string;
  title: string;
  icon?: string;
  children?: MenuItem[];
}

export const menus: MenuItem[] = [
  { path: '/dashboard', title: '数据概览', icon: 'DataBoard' },
  {
    path: '/collect',
    title: '采集管理',
    icon: 'Download',
    children: [
      { path: '/collect/sources', title: '采集源站' },
      { path: '/collect/mapping', title: '分类映射' },
      { path: '/collect/tasks', title: '采集任务' },
      { path: '/collect/logs', title: '采集记录' },
    ],
  },
  {
    path: '/content',
    title: '内容管理',
    icon: 'Film',
    children: [
      { path: '/content/vods', title: '影视管理' },
      { path: '/content/categories', title: '分类管理' },
    ],
  },
  {
    path: '/tools',
    title: '高级工具',
    icon: 'Tools',
    children: [{ path: '/tools/data', title: '数据处理' }],
  },
  {
    path: '/setting',
    title: '系统设置',
    icon: 'Setting',
    children: [
      { path: '/setting/base', title: '基础设置' },
      { path: '/setting/site', title: '站点设置' },
      { path: '/setting/account', title: '账号设置' },
    ],
  },
];

/** 扁平化菜单，用于生成路由与面包屑 */
export function flatMenus(items: MenuItem[] = menus): { path: string; title: string }[] {
  const result: { path: string; title: string }[] = [];
  for (const item of items) {
    if (item.children?.length) {
      result.push(...flatMenus(item.children));
    } else {
      result.push({ path: item.path, title: item.title });
    }
  }
  return result;
}
