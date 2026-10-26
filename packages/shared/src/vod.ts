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

/** 归一化名称的 MD5，判重用。不含年份。 */
export function nameHash(name: string): string {
  return createHash('md5').update(normalizeName(name), 'utf8').digest('hex');
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

/** 剧集展示名：源站名称为空时用「第 N 集」兜底。 */
export function episodeLabel(episode: Episode, index: number): string {
  return episode.name || `第 ${index + 1} 集`;
}
