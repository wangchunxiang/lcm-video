import type { UrlRule } from './types/url-rule.ts';

/** 规则按 sort 升序，停用的跳过 */
function usable(rules: UrlRule[]): UrlRule[] {
  return rules
    .filter((rule) => rule.isEnabled === undefined || rule.isEnabled === 1)
    .filter((rule) => splitUrlPatterns(rule.fromUrl).length > 0)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** 协议前缀，如 `https://` */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** 去掉协议，规则里的地址与地址本身都按这个形式比较 */
function withoutScheme(value: string): string {
  return value.replace(SCHEME, '');
}

/**
 * 一条规则里可以写多个原地址，分隔符：换行（后台输入框按行填）、中英文逗号、分号。
 * 顺手去掉空行与重复项，保留用户输入顺序（用于展示与回填）。
 */
export function splitUrlPatterns(fromUrl: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const part of fromUrl.split(/[\n\r,，;；]+/)) {
    const pattern = part.trim();
    const key = withoutScheme(pattern);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(pattern);
  }
  return result;
}

/** 多条原地址的去协议串，供服务端做 LIKE 预筛（`a OR b OR …`）。`splitUrlPatterns` 已按去协议形式去重去空，这里只需要映射。 */
export function urlRuleNeedles(fromUrl: string): string[] {
  return splitUrlPatterns(fromUrl).map(withoutScheme);
}

/** 实际参与替换的原地址：按长度降序，长的先套，避免父子域名互相抢 */
function matchPatterns(fromUrl: string): string[] {
  return splitUrlPatterns(fromUrl)
    .map((pattern) => withoutScheme(pattern))
    .sort((a, b) => b.length - a.length);
}

/** 套用一个原地址：把地址里的 `from` 换成 `rawTo`（空表示删掉这段） */
function replaceOne(url: string, from: string, rawTo: string): string {
  const to = withoutScheme(rawTo);
  if (!url || !from) return url;

  const scheme = SCHEME.exec(url)?.[0] ?? '';
  if (!to) {
    // 新地址为空 = 删掉这段地址；开头那段的协议一起删，避免留下 `https:///path`
    return url.split(`${scheme}${from}`).join('').split(from).join('');
  }

  const toScheme = SCHEME.exec(rawTo)?.[0] ?? '';
  if (toScheme && url.slice(scheme.length).startsWith(from)) {
    return rawTo + url.slice(scheme.length + from.length);
  }
  return url.split(from).join(to);
}

/**
 * 单个地址替换：地址里出现原地址就替换，不限开头、出现几次换几次。
 *
 * 原地址可以不写协议（如 `vod.a.com`）：匹配时忽略协议，地址自身的协议保持原样；
 * 新地址也可以不写协议。这样一条 `vod.a.com → vod.b.com` 能同时覆盖 http 与
 * https，也能改到 `https://cdn.example/?url=vod.a.com/x.m3u8` 这种出现在中间的地址。
 *
 * 一条规则可以写多个原地址（换行 / 逗号分隔），共用一个新地址：源站反复换域名时，
 * 把历史上的老域名都列进去，重刷一次全部指向新域名。同一条规则内按「长的先套」执行，
 * 避免 `a.com` 抢在 `img.a.com` 前面把子域名先拆成 `img.b.com`。
 *
 * 新地址带了协议、且原地址就在地址开头时，按「协议 + 原地址」整段替换，
 * 这样 `http://a.com → https://b.com` 可以顺带把协议改掉。
 */
export function applyUrlRule(url: string, rule: UrlRule): string {
  const rawTo = rule.toUrl.trim();
  let result = url;
  for (const from of matchPatterns(rule.fromUrl)) result = replaceOne(result, from, rawTo);
  return result;
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
