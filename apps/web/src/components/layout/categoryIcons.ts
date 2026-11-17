import type { Component } from 'vue';
import { Clapperboard, Film, Sparkles, Tv } from 'lucide-vue-next';

/**
 * 一级分类的图标按 alias 认；接口里新增的分类没配图标就不猜。
 * 顶栏导航与移动端底栏共用这一份，避免两处各写一套出现不一致。
 */
export const CATEGORY_ICONS: Record<string, Component> = {
  dianying: Film,
  juji: Tv,
  zongyi: Clapperboard,
  dongman: Sparkles,
};
