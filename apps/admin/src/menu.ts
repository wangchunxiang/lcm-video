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
      { path: '/collect/sources', title: '采集源站', icon: 'Link' },
      { path: '/collect/rules', title: '替换规则', icon: 'Switch' },
      { path: '/collect/mapping', title: '分类映射', icon: 'Share' },
      { path: '/collect/tasks', title: '采集任务', icon: 'AlarmClock' },
      { path: '/collect/logs', title: '采集记录', icon: 'Tickets' },
    ],
  },
  {
    path: '/content',
    title: '内容管理',
    icon: 'Film',
    children: [
      { path: '/content/vods', title: '影视管理', icon: 'VideoCamera' },
      { path: '/content/categories', title: '分类管理', icon: 'CollectionTag' },
    ],
  },
  {
    path: '/playback',
    title: '播放管理',
    icon: 'VideoPlay',
    children: [
      { path: '/playback/config', title: '播放设置', icon: 'Setting' },
      { path: '/playback/lines', title: '线路设置', icon: 'Connection' },
    ],
  },
  {
    path: '/tools',
    title: '高级工具',
    icon: 'SetUp',
    children: [
      { path: '/tools/data', title: '数据处理', icon: 'MagicStick' },
      { path: '/tools/merge', title: '重复影片', icon: 'CopyDocument' },
    ],
  },
  {
    path: '/setting',
    title: '系统管理',
    icon: 'Setting',
    children: [
      { path: '/setting/site', title: '站点设置', icon: 'Monitor' },
      { path: '/setting/account', title: '账号设置', icon: 'User' },
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
