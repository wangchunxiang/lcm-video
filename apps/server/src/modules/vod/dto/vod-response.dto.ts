import { VodEntity } from '../vod.entity';

/**
 * 列表行：影片本体 + 分类名 + 播放线路统计。
 * 实体只描述表结构，这一层描述「返回给前端的形状」。
 */
export interface VodRow extends VodEntity {
  categoryName: string;
  parentName: string;
  plays: number;
  episodes: number;
}
