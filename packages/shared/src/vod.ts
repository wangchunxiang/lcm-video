import { createHash } from 'node:crypto';

/**
 * 影片名归一化：去首尾空格、全角转半角、合并连续空格。
 * 括号及其内容保留。
 */
export function normalizeName(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 严格判重键：在归一化基础上去掉所有空白并转小写，标点保留。
 * 源站标题的空格写法不统一（「仙逆剧场版 神临之战」与「仙逆剧场版神临之战」），
 * 只折叠空格对不上，必须删掉空白才能判成同一部；标点可能是片名的一部分，不删。
 */
export function matchKey(input: string): string {
  return normalizeName(input)
    .replace(/[\s ]+/g, '')
    .toLowerCase();
}

/** 宽松键：在严格键基础上去掉标点，只用于后台「疑似重复」提示，不参与自动判重。 */
export function looseKey(input: string): string {
  return matchKey(input).replace(
    /[\u00b7\u2022\u30fb:\uff1a,\uff0c\u3001\u3002.;\uff1b!\uff01?\uff1f\u300a\u300b<>\uff08\uff09\u3010\u3011{}\u2014\u2013\-_~\uff5e+\uff0b&\uff06\/]/g,
    '',
  );
}

/** 严格键的 MD5，入库判重用。不含年份。 */
export function nameHash(name: string): string {
  return createHash('md5').update(matchKey(name), 'utf8').digest('hex');
}

/** 宽松键的 MD5，仅用于后台疑似重复提示。 */
export function looseHash(name: string): string {
  return createHash('md5').update(looseKey(name), 'utf8').digest('hex');
}

export interface Episode {
  /** 剧集名称，如「第01集」 */
  name: string;
  /** 播放地址 */
  url: string;
}

/** 按 `#` 切分剧集串，空值返回空数组。 */
export function splitEpisodes(playUrl: string): string[] {
  if (!playUrl) return [];
  return playUrl.split('#').filter((part) => part.trim() !== '');
}

/** 剧集数量：`play_url` 按 `#` 切分后的非空段数。 */
export function countEpisodes(playUrl: string): number {
  return splitEpisodes(playUrl).length;
}

/** 解析剧集串，每段格式为「名称$地址」；没有 `$` 时名称留空。 */
export function parsePlayUrl(playUrl: string): Episode[] {
  return splitEpisodes(playUrl).map((part) => {
    const idx = part.indexOf('$');
    if (idx < 0) return { name: '', url: part.trim() };
    return { name: part.slice(0, idx).trim(), url: part.slice(idx + 1).trim() };
  });
}

/** 剧集标签宽度：1=一格、2=两格、3=整行。按展示名长度决定，避免长名被截断。 */
export function episodeSpan(label: string): 1 | 2 | 3 {
  const length = [...label.trim()].length;
  if (length <= 6) return 1;
  if (length <= 12) return 2;
  return 3;
}

/** 剧集展示名：源站名称为空时用「第 N 集」兜底。 */
export function episodeLabel(episode: Episode, index: number): string {
  return episode.name || `第 ${index + 1} 集`;
}

/** 已知的封面域名迁移：源站换了图床但接口仍返回旧域名时，就地改写 */
const COVER_HOST_MAP: Array<[string, string]> = [['ps.ryzypics.com', 'pic.ry-pic.com']];

/** 把源站返回的封面地址里的旧域名换成新域名 */
export function normalizeCover(url: string | null | undefined): string {
  const text = String(url ?? '').trim();
  if (!text) return '';
  for (const [from, to] of COVER_HOST_MAP) {
    if (text.includes(from)) return text.split(from).join(to);
  }
  return text;
}
