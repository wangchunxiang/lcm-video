/** 采集源的地址替换规则（对应 lcm_source_rule）。 */
export type UrlRule = {
  /** 1 播放地址 2 图片地址 */
  kind: number;
  fromUrl: string;
  toUrl: string;
  isEnabled?: number;
  sort?: number;
};
