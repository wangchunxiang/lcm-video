import type { UrlRule } from './types/url-rule.ts';

/** 规则按 sort 升序，停用的跳过 */
function usable(rules: UrlRule[]): UrlRule[] {
  return rules
    .filter((rule) => rule.isEnabled === undefined || rule.isEnabled === 1)
    .filter((rule) => rule.fromUrl.trim() !== '')
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** 协议前缀，如 `https://` */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * 单个地址做前缀替换：只有以原地址开头才替换，避免改到路径中段。
 *
 * 原地址可以不写协议（如 `vod.a.com`）：此时按「忽略协议」比较，替换后把地址
 * 原本的协议补回去；新地址自带协议时以新地址为准。这样一条规则能同时覆盖
 * http 与 https，也符合后台填写时的直觉。
 */
export function applyUrlRule(url: string, rule: UrlRule): string {
  const from = rule.fromUrl.trim();
  const to = rule.toUrl.trim();
  if (!url || !from) return url;

  const scheme = SCHEME.exec(url)?.[0] ?? '';
  const target = SCHEME.test(from) ? url : url.slice(scheme.length);
  if (!target.startsWith(from)) return url;

  const rest = target.slice(from.length);
  if (!to) return rest;
  return SCHEME.test(to) ? to + rest : `${scheme}${to}${rest}`;
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
