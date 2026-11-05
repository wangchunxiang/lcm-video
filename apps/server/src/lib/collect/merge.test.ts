import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MERGE_CONFIG,
  mergeVodContent,
  normalizeMergeConfig,
  type MergeableVod,
  type MergeContext,
  type MergeConfig,
  type MergeStrategy,
} from './merge.ts';

const base = (patch: Partial<MergeableVod> = {}): MergeableVod => ({
  name: '沙丘',
  nameHash: 'h1',
  nameHashLoose: 'h2',
  subName: '',
  letter: '',
  cover: '',
  coverHost: '',
  actor: '',
  director: '',
  writer: '',
  intro: '',
  content: '',
  remarks: '',
  releaseDate: '',
  episodeCount: 0,
  area: '',
  lang: '',
  year: 2024,
  ...patch,
});

const ctx = (patch: Partial<MergeContext> = {}): MergeContext => ({
  trusted: false,
  brokenCoverHosts: new Set<string>(),
  ...patch,
});

const config = (fields: Record<string, MergeStrategy> = {}): MergeConfig => ({
  mode: 'merge',
  fields: { ...DEFAULT_MERGE_CONFIG.fields, ...fields },
});

describe('mergeVodContent', () => {
  it('不会用新源的空值覆盖旧值', () => {
    const old = base({ actor: '甲,乙', intro: '一段简介', area: '美国' });
    const next = base({ actor: '', intro: '', area: '' });
    expect(mergeVodContent(old, next, config(), ctx())).toEqual({});
  });

  it('演员按人数取多，更有数据的源赢', () => {
    const old = base({ actor: '甲' });
    const next = base({ actor: '甲,乙,丙' });
    expect(mergeVodContent(old, next, config(), ctx()).actor).toBe('甲,乙,丙');
  });

  it('简介默认取较长的一条', () => {
    const old = base({ intro: '短' });
    const next = base({ intro: '很长的一段介绍' });
    expect(mergeVodContent(old, next, config(), ctx()).intro).toBe('很长的一段介绍');
    expect(mergeVodContent(base({ intro: '很长的一段介绍' }), base({ intro: '短' }), config(), ctx())).toEqual({});
  });

  it('更新进度：完结不会被连载覆盖，连载按集数取大', () => {
    const done = base({ remarks: '已完结' });
    expect(mergeVodContent(done, base({ remarks: '更新至第 10 集' }), config(), ctx())).toEqual({});

    const playing = base({ remarks: '更新至第 10 集' });
    expect(mergeVodContent(playing, base({ remarks: '更新至第 12 集' }), config(), ctx()).remarks).toBe(
      '更新至第 12 集',
    );
    expect(mergeVodContent(playing, base({ remarks: '更新至第 8 集' }), config(), ctx())).toEqual({});

    // 标记之间保留旧值
    expect(mergeVodContent(base({ remarks: 'HD中字' }), base({ remarks: '正片' }), config(), ctx())).toEqual({});
    // 旧标记遇到新进度，换成进度
    expect(mergeVodContent(base({ remarks: '正片' }), base({ remarks: '更新至第 3 集' }), config(), ctx()).remarks).toBe(
      '更新至第 3 集',
    );
  });

  it('集数只增不减', () => {
    expect(mergeVodContent(base({ episodeCount: 12 }), base({ episodeCount: 10 }), config(), ctx())).toEqual({});
    expect(mergeVodContent(base({ episodeCount: 12 }), base({ episodeCount: 16 }), config(), ctx()).episodeCount).toBe(
      16,
    );
  });

  it('封面：旧图为空或旧图域名失效才替换', () => {
    const old = base({ cover: 'https://bad.example.com/a.jpg', coverHost: 'bad.example.com' });
    const next = base({ cover: 'https://good.example.com/b.jpg' });
    // 域名未知失效时保留旧图
    expect(mergeVodContent(old, next, config(), ctx()).cover).toBeUndefined();
    // 图片体检判定失效后换成新图
    expect(
      mergeVodContent(old, next, config(), ctx({ brokenCoverHosts: new Set(['bad.example.com']) })).cover,
    ).toBe('https://good.example.com/b.jpg');
    // 旧图为空时补新图
    expect(mergeVodContent(base(), next, config(), ctx()).cover).toBe('https://good.example.com/b.jpg');
  });

  it('同源更新时静态字段允许非空覆盖', () => {
    const old = base({ intro: '旧的长简介', actor: '甲,乙' });
    const next = base({ intro: '新的短简介', actor: '甲' });
    expect(mergeVodContent(old, next, config(), ctx({ trusted: true })).intro).toBe('新的短简介');
    expect(mergeVodContent(old, next, config(), ctx({ trusted: true })).actor).toBe('甲');
  });

  it('上映日期：旧值不是日期时被新日期替换', () => {
    const old = base({ releaseDate: '未知' });
    const next = base({ releaseDate: '2024-03-01' });
    expect(mergeVodContent(old, next, config(), ctx()).releaseDate).toBe('2024-03-01');
    expect(
      mergeVodContent(base({ releaseDate: '2024-03-01' }), base({ releaseDate: '2025-01-01' }), config(), ctx()),
    ).toEqual({});
  });

  it('年份与判重键不参与合并', () => {
    const old = base({ year: 2024, name: '沙丘', nameHash: 'h1' });
    const next = base({ year: 2023, name: '沙丘2', nameHash: 'h9' });
    expect(mergeVodContent(old, next, config(), ctx())).toEqual({});
  });

  it('策略改为保留旧值后不再取较长', () => {
    const old = base({ intro: '短' });
    const next = base({ intro: '很长的一段介绍' });
    expect(mergeVodContent(old, next, config({ intro: 'keep' }), ctx())).toEqual({});
  });
});

describe('normalizeMergeConfig', () => {
  it('缺省时给默认配置', () => {
    const result = normalizeMergeConfig(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.mode).toBe('merge');
  });

  it('拒绝不认识的策略值', () => {
    const result = normalizeMergeConfig({ fields: { intro: 'shorter' } });
    expect(result.ok).toBe(false);
  });

  it('忽略已经不存在的字段，便于以后删字段', () => {
    const result = normalizeMergeConfig({ fields: { removed_field: 'keep', intro: 'longer' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.fields.intro).toBe('longer');
  });
});
