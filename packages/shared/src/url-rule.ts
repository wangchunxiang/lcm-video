/** 采集源的地址替换规则 */
export type UrlRule = {
  /** 1 播放地址 2 图片地址 */
  kind: number;
  fromUrl: string;
  toUrl: string;
  isEnabled?: number;
  sort?: number;
};

/** 规则按 sort 升序，停用的跳过 */
function usable(rules: UrlRule[]): UrlRule[] {
  return rules
    .filter((rule) => rule.isEnabled === undefined || rule.isEnabled === 1)
    .filter((rule) => rule.fromUrl.trim() !== '')
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** 单个地址做前缀替换：只有以原地址开头才替换，避免改到路径中段 */
export function applyUrlRule(url: string, rule: UrlRule): string {
  const from = rule.fromUrl.trim();
  const to = rule.toUrl.trim();
  if (!url || !from || !url.startsWith(from)) return url;
  return to + url.slice(from.length);
}

/** 对一条地址串应用一组规则（按顺序依次套用） */
export function applyUrlRules(url: string, rules: UrlRule[]): string {
  let result = url;
  for (const rule of usable(rules)) result = applyUrlRule(result, rule);
  return result;
}

/**
 * 播放地址串替换：格式为「名称$地址#名称$地址」。
 * 逐集处理，只替换地址部分，名称保持原样。
 */
export function applyPlayUrlRules(playUrl: string, rules: UrlRule[]): string {
  const list = usable(rules);
  if (!playUrl || list.length === 0) return playUrl;
  return playUrl
    .split('#')
    .map((part) => {
      const idx = part.indexOf('$');
      if (idx < 0) return applyUrlRules(part.trim(), list);
      const name = part.slice(0, idx);
      const url = applyUrlRules(part.slice(idx + 1).trim(), list);
      return `${name}$${url}`;
    })
    .join('#');
}

/** 封面地址替换：整条 URL 做前缀替换 */
export function applyCoverRules(cover: string, rules: UrlRule[]): string {
  return applyUrlRules(cover, rules);
}
