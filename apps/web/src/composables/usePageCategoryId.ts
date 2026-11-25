import { ref } from 'vue';

/**
 * 详情页 / 播放页的 URL 里没有分类 alias，底部导航没法像列表页那样从路由直接判断高亮。
 * 这两个页面拿到影片数据后把 `categoryId` 写进来，底栏再回溯到一级分类；
 * 路由切走时值不再被使用（底栏只在 detail / play 上读它），不需要额外清理。
 */
export const pageCategoryId = ref('');
