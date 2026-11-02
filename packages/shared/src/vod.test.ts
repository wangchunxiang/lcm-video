import { describe, expect, it } from 'vitest';
import {
  countEpisodes,
  episodeLabel,
  looseKey,
  matchKey,
  nameHash,
  normalizeName,
  parsePlayUrl,
  splitEpisodes,
} from './vod.ts';

describe('normalizeName', () => {
  it('全角转半角并折叠空白', () => {
    expect(normalizeName('　ＡＢＣ１２３　')).toBe('ABC123');
    expect(normalizeName('仙逆剧场版   神临之战')).toBe('仙逆剧场版 神临之战');
  });
});

describe('判重键', () => {
  it('严格键忽略空白与大小写', () => {
    expect(matchKey('仙逆剧场版 神临之战')).toBe('仙逆剧场版神临之战');
    expect(matchKey('The  Movie')).toBe('themovie');
  });

  it('宽松键额外忽略标点', () => {
    expect(looseKey('命运·之夜')).toBe('命运之夜');
    expect(looseKey('你好,世界！')).toBe('你好世界');
  });

  it('严格键保留标点，宽松键才去掉', () => {
    expect(matchKey('命运·之夜')).not.toBe(matchKey('命运之夜'));
  });

  it('哈希稳定且为 32 位十六进制', () => {
    expect(nameHash('仙逆')).toMatch(/^[0-9a-f]{32}$/);
    expect(nameHash('仙逆')).toBe(nameHash(' 仙逆 '));
  });
});

describe('剧集解析', () => {
  it('按 # 切分，空段忽略', () => {
    expect(splitEpisodes('第1集$http://a#第2集$http://b#')).toHaveLength(2);
    expect(splitEpisodes('')).toEqual([]);
  });

  it('没有 $ 时名称留空', () => {
    expect(parsePlayUrl('第01集$http://a#http://b')).toEqual([
      { name: '第01集', url: 'http://a' },
      { name: '', url: 'http://b' },
    ]);
  });

  it('统计集数', () => {
    expect(countEpisodes('a$1#b$2#c$3')).toBe(3);
    expect(countEpisodes('')).toBe(0);
  });

  it('名称缺失时兜底为第 N 集', () => {
    expect(episodeLabel({ name: '', url: 'http://a' }, 0)).toBe('第 1 集');
    expect(episodeLabel({ name: '正片', url: 'http://a' }, 3)).toBe('正片');
  });
});
