import { describe, expect, it } from 'vitest';
import { applyPlayUrlRules, applyUrlRule, applyUrlRules, splitUrlPatterns, urlRuleNeedles } from './url-rule.ts';
import type { UrlRule } from './types/url-rule.ts';

const rule = (fromUrl: string, toUrl: string, extra: Partial<UrlRule> = {}): UrlRule => ({
  kind: 1,
  fromUrl,
  toUrl,
  ...extra,
});

describe('applyUrlRule', () => {
  it('地址里出现原地址就替换，不限开头', () => {
    expect(applyUrlRule('http://a.com/x.m3u8', rule('http://a.com', 'https://b.com'))).toBe(
      'https://b.com/x.m3u8',
    );
    expect(applyUrlRule('https://x.com/a.com/y', rule('a.com', 'b.com'))).toBe('https://x.com/b.com/y');
    expect(applyUrlRule('https://cdn.example/?url=vod.a.com/x.m3u8', rule('vod.a.com', 'vod.b.com'))).toBe(
      'https://cdn.example/?url=vod.b.com/x.m3u8',
    );
  });

  it('出现多次时全部替换', () => {
    expect(applyUrlRule('https://a.com/a.com/x', rule('a.com', 'b.com'))).toBe('https://b.com/b.com/x');
  });

  it('不匹配时原样返回', () => {
    expect(applyUrlRule('http://c.com/x', rule('http://a.com', 'https://b.com'))).toBe('http://c.com/x');
  });

  it('单个规则不做启用判断（由 applyUrlRules 过滤）', () => {
    expect(applyUrlRule('http://a.com/x', rule('http://a.com', 'https://b.com', { isEnabled: 0 }))).toBe(
      'https://b.com/x',
    );
  });

  it('规则带不带协议都按域名匹配，地址自身的协议不变', () => {
    expect(applyUrlRule('https://a.com/x', rule('a.com', 'b.com'))).toBe('https://b.com/x');
    expect(applyUrlRule('http://a.com/x', rule('a.com', 'b.com'))).toBe('http://b.com/x');
    expect(applyUrlRule('http://a.com/x', rule('https://a.com', 'http://b.com'))).toBe('http://b.com/x');
  });

  it('新地址为空时删掉这段前缀与协议', () => {
    expect(applyUrlRule('https://a.com/x', rule('https://a.com', ''))).toBe('/x');
    expect(applyUrlRule('https://cdn.example/?url=a.com/x', rule('a.com', ''))).toBe(
      'https://cdn.example/?url=/x',
    );
  });
});

describe('一条规则多个原地址', () => {
  /** 图床反复换域名：历史域名列在同一条规则里，共用当前域名 */
  const history = [
    'img.image8899.net',
    'img.ffzy888.com',
    'pps.vodfeiss.com',
    'tupian.ffeiimg.com',
    'img.feifeiimg.vip',
  ].join('\n');

  it('换行分隔的多条原地址都指向同一个新地址', () => {
    for (const host of history.split('\n')) {
      expect(applyUrlRule(`https://${host}/a.jpg`, rule(history, 'fffgood.com'))).toBe(
        'https://fffgood.com/a.jpg',
      );
    }
    expect(applyUrlRule('https://other.com/a.jpg', rule(history, 'fffgood.com'))).toBe(
      'https://other.com/a.jpg',
    );
  });

  it('中英文逗号、分号也能分隔', () => {
    expect(applyUrlRule('https://b.com/x', rule('a.com,b.com', 'c.com'))).toBe('https://c.com/x');
    expect(applyUrlRule('https://b.com/x', rule('a.com，b.com', 'c.com'))).toBe('https://c.com/x');
    expect(applyUrlRule('https://b.com/x', rule('a.com；b.com', 'c.com'))).toBe('https://c.com/x');
  });

  it('同一规则内长的先套，避免父子域名互相抢', () => {
    // 若 a.com 先套，img.a.com 会变成 img.b.com
    expect(applyUrlRule('https://img.a.com/x.jpg', rule('a.com\nimg.a.com', 'b.com'))).toBe(
      'https://b.com/x.jpg',
    );
  });

  it('空行与重复项被忽略', () => {
    // 只差协议也算重复（匹配时本来就忽略协议）
    expect(splitUrlPatterns('\n a.com \n\n a.com\nhttps://a.com\n')).toEqual(['a.com']);
    expect(urlRuleNeedles('\n a.com \n\n a.com\nhttps://a.com\n')).toEqual(['a.com']);
    expect(splitUrlPatterns('a.com\nb.com')).toEqual(['a.com', 'b.com']);
    expect(applyUrlRule('https://a.com/x', rule('\n\n', 'b.com'))).toBe('https://a.com/x');
  });
});

describe('applyUrlRules', () => {
  it('按 sort 升序依次套用', () => {
    const rules = [rule('http://a.com', 'http://c.com', { sort: 2 }), rule('http://c.com', 'http://d.com', { sort: 1 })];
    expect(applyUrlRules('http://a.com/x', rules)).toBe('http://c.com/x');
  });

  it('忽略停用规则', () => {
    expect(applyUrlRules('http://a.com/x', [rule('http://a.com', 'https://b.com', { isEnabled: 0 })])).toBe(
      'http://a.com/x',
    );
  });

  it('忽略空 fromUrl', () => {
    expect(applyUrlRules('http://a.com/x', [rule('  ', 'http://z.com')])).toBe('http://a.com/x');
  });
});

describe('播放串替换', () => {
  it('只替换地址，名称保持不变', () => {
    const rules = [rule('http://a.com', 'https://b.com')];
    expect(applyPlayUrlRules('第1集$http://a.com/1#第2集$http://a.com/2', rules)).toBe(
      '第1集$https://b.com/1#第2集$https://b.com/2',
    );
  });

  it('没有规则时原样返回', () => {
    expect(applyPlayUrlRules('第1集$http://a.com/1', [])).toBe('第1集$http://a.com/1');
  });
});

describe('封面替换', () => {
  it('整条地址做前缀替换', () => {
    expect(applyUrlRules('http://img.a.com/p.jpg', [rule('http://img.a.com', 'https://img.b.com')])).toBe(
      'https://img.b.com/p.jpg',
    );
  });
});
