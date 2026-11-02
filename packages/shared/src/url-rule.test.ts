import { describe, expect, it } from 'vitest';
import { applyCoverRules, applyPlayUrlRules, applyUrlRule, applyUrlRules, type UrlRule } from './url-rule.ts';

const rule = (fromUrl: string, toUrl: string, extra: Partial<UrlRule> = {}): UrlRule => ({
  kind: 1,
  fromUrl,
  toUrl,
  ...extra,
});

describe('applyUrlRule', () => {
  it('只做前缀替换', () => {
    expect(applyUrlRule('http://a.com/x.m3u8', rule('http://a.com', 'https://b.com'))).toBe(
      'https://b.com/x.m3u8',
    );
  });

  it('不匹配时原样返回', () => {
    expect(applyUrlRule('http://c.com/x', rule('http://a.com', 'https://b.com'))).toBe('http://c.com/x');
  });

  it('单个规则不做启用判断（由 applyUrlRules 过滤）', () => {
    expect(applyUrlRule('http://a.com/x', rule('http://a.com', 'https://b.com', { isEnabled: 0 }))).toBe(
      'https://b.com/x',
    );
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
    expect(applyCoverRules('http://img.a.com/p.jpg', [rule('http://img.a.com', 'https://img.b.com')])).toBe(
      'https://img.b.com/p.jpg',
    );
  });
});
