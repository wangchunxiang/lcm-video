export interface MenuItem {
  path: string;
  title: string;
  children?: MenuItem[];
}

/**
 * 后台菜单。侧边栏按分组展示，但**路由是拍平的**：
 * 分组节点只作为 el-sub-menu 的 index（不是路由），叶子节点的 path 就是页面地址。
 *
 * 这里**不放图标**：图标按 path 集中登记在 `layout/menuIcons.ts`，
 * 加菜单时记得两边各加一条，别在这一层写死图标名。
 */
export const menus: MenuItem[] = [
  { path: '/dashboard', title: '数据概览' },
  {
    path: '/collect',
    title: '采集管理',
    children: [
      { path: '/sources', title: '采集源站' },
      { path: '/source-rules', title: '替换规则' },
      { path: '/mappings', title: '分类映射' },
      { path: '/merge-rules', title: '入库规则' },
      { path: '/tasks', title: '采集任务' },
      { path: '/logs', title: '采集记录' },
    ],
  },
  {
    path: '/content',
    title: '内容管理',
    children: [
      { path: '/vods', title: '影视管理' },
      { path: '/categories', title: '分类管理' },
    ],
  },
  {
    path: '/playback',
    title: '播放管理',
    children: [
      { path: '/player-settings', title: '播放设置' },
      { path: '/play-lines', title: '线路设置' },
    ],
  },
  {
    path: '/tools',
    title: '高级工具',
    children: [
      { path: '/merge', title: '重复影片' },
      { path: '/cover-check', title: '图片检查' },
    ],
  },
  {
    path: '/setting',
    title: '系统管理',
    children: [
      { path: '/site', title: '站点设置' },
      { path: '/account', title: '账号设置' },
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
