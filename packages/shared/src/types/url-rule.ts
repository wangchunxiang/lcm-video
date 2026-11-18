/** 采集源的地址替换规则（对应 lcm_source_rule）。 */
export type UrlRule = {
  /** 1 播放地址 2 图片地址 */
  kind: number;
  /** 原地址，可多条：换行 / 逗号分隔，共用同一个 toUrl */
  fromUrl: string;
  toUrl: string;
  isEnabled?: number;
  sort?: number;
};
