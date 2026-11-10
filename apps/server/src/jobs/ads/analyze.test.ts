import { describe, expect, it } from 'vitest';
import { listCandidates, parsePlaylist, signatureOf } from './analyze';

/** 造一个 4 段的播放列表：片头 1 段(12s) + 正片 2 段 + 片尾 1 段(18s) */
const PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXTINF:12.000,',
  'seg0.ts',
  '#EXT-X-DISCONTINUITY',
  '#EXTINF:6.000,',
  'seg1.ts',
  '#EXTINF:6.000,',
  'seg2.ts',
  '#EXT-X-DISCONTINUITY',
  '#EXTINF:18.000,',
  'seg3.ts',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

describe('parsePlaylist', () => {
  it('读出每段时长与 discontinuity 边界', () => {
    const { segments, boundaries } = parsePlaylist(PLAYLIST);
    expect(segments.map((s) => s.dur)).toEqual([12, 6, 6, 18]);
    expect(segments.map((s) => s.uri)).toEqual(['seg0.ts', 'seg1.ts', 'seg2.ts', 'seg3.ts']);
    // 0 起、两处 discontinuity(1 与 3)、末尾补总长 4
    expect(boundaries).toEqual([0, 1, 3, 4]);
  });

  it('空行与注释行不影响分片计数', () => {
    const { segments } = parsePlaylist('\n\n#EXTM3U\n#EXTINF:5.5,\na.ts\n#EXT-X-ENDLIST\n');
    expect(segments).toHaveLength(1);
    expect(segments[0]?.dur).toBe(5.5);
  });
});

describe('listCandidates', () => {
  it('枚举 6~30 秒的候选，并按位置判定片头/片中/片尾', () => {
    const { segments, boundaries } = parsePlaylist(PLAYLIST);
    const candidates = listCandidates(segments, boundaries);

    // 单段成组的候选：片头 12s(1)、片尾 18s(3)
    expect(candidates.filter((c) => c.durs.length === 1).map((c) => [c.kind, c.totalMs])).toEqual([
      [1, 12000],
      [3, 18000],
    ]);
    // 中间那组是两段连续的 6s 正片，整体 12s
    expect(candidates.some((c) => c.durs.length === 2 && c.totalMs === 12000 && c.kind === 2)).toBe(true);
    // 跨两组：片头+正片 24s、正片+片尾 30s（正好卡在上限）
    expect(candidates.some((c) => c.totalMs === 24000 && c.kind === 1)).toBe(true);
    expect(candidates.some((c) => c.totalMs === 30000 && c.kind === 3)).toBe(true);
  });

  it('超过 30 秒或不足 6 秒的窗口不产生候选', () => {
    const segments = [
      { dur: 2, uri: 'a.ts' },
      { dur: 2, uri: 'b.ts' },
    ];
    expect(listCandidates(segments, [0, 2])).toHaveLength(0);

    const long = [
      { dur: 20, uri: 'a.ts' },
      { dur: 20, uri: 'b.ts' },
    ];
    // 单段 20 秒各自成候选，但跨两段 40 秒超上限
    const out = listCandidates(long, [0, 1, 2]);
    expect(out.every((c) => c.totalMs <= 30000)).toBe(true);
  });
});

describe('signatureOf', () => {
  it('两位小数、逗号分隔，作为唯一指纹', () => {
    expect(signatureOf([12, 6.5, 18])).toBe('12.00,6.50,18.00');
    expect(signatureOf([12, 6])).not.toBe(signatureOf([6, 12]));
  });
});
