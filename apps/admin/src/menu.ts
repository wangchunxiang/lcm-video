export interface MenuItem {
  path: string;
  title: string;
  icon?: string;
  children?: MenuItem[];
}

/**
 * 后台菜单。侧边栏按分组展示，但**路由是拍平的**：
 * 分组节点只作为 el-sub-menu 的 index（不是路由），叶子节点的 path 就是页面地址。
 */
export const menus: MenuItem[] = [
  { path: '/dashboard', title: '数据概览', icon: 'DataBoard' },
  {
    path: '/collect',
    title: '采集管理',
    icon: 'Download',
    children: [
      { path: '/sources', title: '采集源站', icon: 'Link' },
      { path: '/source-rules', title: '替换规则', icon: 'Switch' },
      { path: '/mappings', title: '分类映射', icon: 'Share' },
      { path: '/merge-rules', title: '入库规则', icon: 'Operation' },
      { path: '/tasks', title: '采集任务', icon: 'AlarmClock' },
      { path: '/logs', title: '采集记录', icon: 'Tickets' },
    ],
  },
  {
    path: '/content',
    title: '内容管理',
    icon: 'Film',
    children: [
      { path: '/vods', title: '影视管理', icon: 'VideoCamera' },
      { path: '/categories', title: '分类管理', icon: 'CollectionTag' },
    ],
  },
  {
    path: '/playback',
    title: '播放管理',
    icon: 'VideoPlay',
    children: [
      { path: '/player-settings', title: '播放设置', icon: 'Setting' },
      { path: '/play-lines', title: '线路设置', icon: 'Connection' },
    ],
  },
  {
    path: '/tools',
    title: '高级工具',
    icon: 'SetUp',
    children: [
      { path: '/merge', title: '重复影片', icon: 'CopyDocument' },
      { path: '/cover-check', title: '图片检查', icon: 'Picture' },
    ],
  },
  {
    path: '/setting',
    title: '系统管理',
    icon: 'Setting',
    children: [
      { path: '/site', title: '站点设置', icon: 'Monitor' },
      { path: '/account', title: '账号设置', icon: 'User' },
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
