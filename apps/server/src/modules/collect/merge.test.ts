import { describe, expect, it } from 'vitest';
import { DEFAULT_MERGE_CONFIG, mergeVodContent } from './merge';
import type { MergeContext, MergeableVod } from './merge';

const base: MergeableVod = {
  name: '测试片',
  nameHash: 'h'.repeat(32),
  nameHashLoose: 'l'.repeat(32),
  subName: '',
  cover: '',
  coverHost: '',
  actor: '',
  director: '',
  writer: '',
  intro: '',
  content: '',
  remarks: '',
  releaseDate: '',
  episodeCount: 1,
  area: '',
  lang: '',
  year: 2026,
};

const ctx = (trusted: boolean): MergeContext => ({ trusted, brokenCoverHosts: new Set<string>() });

describe('mergeVodContent 封面', () => {
  it('旧图为空时用新图，并同步 cover_host', () => {
    const patch = mergeVodContent(
      { ...base },
      { ...base, cover: 'https://img.new.example.net/a.jpg' },
      DEFAULT_MERGE_CONFIG,
      ctx(false),
    );
    expect(patch.cover).toBe('https://img.new.example.net/a.jpg');
    // cover_host 是从 cover 派生的业务列，必须一起更新
    expect(patch.coverHost).toBe('img.new.example.net');
  });

  it('同源更新时换新图，cover_host 跟着换', () => {
    const patch = mergeVodContent(
      { ...base, cover: 'https://img.old.example.net/a.jpg', coverHost: 'img.old.example.net' },
      { ...base, cover: 'https://img.new.example.net/a.jpg' },
      DEFAULT_MERGE_CONFIG,
      ctx(true),
    );
    expect(patch.cover).toBe('https://img.new.example.net/a.jpg');
    expect(patch.coverHost).toBe('img.new.example.net');
  });

  it('非可信来源且旧图正常时保留旧图，不改 cover_host', () => {
    const patch = mergeVodContent(
      { ...base, cover: 'https://img.old.example.net/a.jpg', coverHost: 'img.old.example.net' },
      { ...base, cover: 'https://img.new.example.net/a.jpg' },
      DEFAULT_MERGE_CONFIG,
      ctx(false),
    );
    expect(patch.cover).toBeUndefined();
    expect(patch.coverHost).toBeUndefined();
  });

  it('旧图域名已判失效时换掉，并同步 cover_host', () => {
    const patch = mergeVodContent(
      { ...base, cover: 'https://img.bad.example.net/a.jpg', coverHost: 'img.bad.example.net' },
      { ...base, cover: 'https://img.new.example.net/a.jpg' },
      DEFAULT_MERGE_CONFIG,
      { trusted: false, brokenCoverHosts: new Set(['img.bad.example.net']) },
    );
    expect(patch.cover).toBe('https://img.new.example.net/a.jpg');
    expect(patch.coverHost).toBe('img.new.example.net');
  });
});
