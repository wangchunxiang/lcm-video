/** 一集：名称与播放地址。`play_url` 里每段是「名称$地址」。 */
export interface Episode {
  /** 剧集名称，如「第01集」 */
  name: string;
  /** 播放地址 */
  url: string;
}

/** 源站分类与本站分类做自动匹配时需要的字段。 */
export interface CategoryMatchInfo {
  id: number;
  pid: number;
  name: string;
  /** 可用于匹配的别名（category.match_names 按逗号拆开） */
  matchNames: string[];
}
