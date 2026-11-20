import type { Component } from 'vue';
import {
  CalendarClock,
  ClipboardCheck,
  Clapperboard,
  Copy,
  Download,
  Film,
  FolderTree,
  Image,
  LayoutDashboard,
  Monitor,
  Play,
  Replace,
  Route,
  ScrollText,
  Server,
  Settings,
  Settings2,
  Tags,
  User,
  Wrench,
} from 'lucide-vue-next';

/**
 * 后台菜单图标：`path → 组件`。
 *
 * 全站只有这一处把路径和图标绑在一起——`menu.ts` 里只放标题与层级，
 * 模板统一 `<component :is="menuIcon(item.path)" />`，这样加菜单时不会有人
 * 顺手在自己那个页面里 import 一个图标，最后三种图标库混着用。
 *
 * 图标一律用 lucide（与前台同一套视觉语言）：不传 `stroke-width`，只传 `:size="16"`
 * （分组标题与叶子项同尺寸），颜色跟随 `currentColor`，由 el-menu 的文字色决定。
 */
export const MENU_ICONS: Record<string, Component> = {
  '/dashboard': LayoutDashboard,

  '/collect': Download,
  '/sources': Server,
  '/source-rules': Replace,
  '/mappings': FolderTree,
  '/merge-rules': ClipboardCheck,
  '/tasks': CalendarClock,
  '/logs': ScrollText,

  '/content': Film,
  '/vods': Clapperboard,
  '/categories': Tags,

  '/playback': Play,
  '/player-settings': Settings2,
  '/play-lines': Route,

  '/tools': Wrench,
  '/merge': Copy,
  '/cover-check': Image,

  '/setting': Settings,
  '/site': Monitor,
  '/account': User,
};

/** 没配图标的菜单项返回 undefined，模板里 `v-if` 之后整块不渲染，不留空位 */
export function menuIcon(path: string): Component | undefined {
  return MENU_ICONS[path];
}
