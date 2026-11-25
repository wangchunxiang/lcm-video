import { describe, expect, it } from 'vitest';
import {
  countSignatureHits,
  isRunInside,
  listCandidates,
  parsePlaylist,
  signatureOf,
} from './analyze';

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

/** 造分片数组，只需要时长 */
const segs = (durs: number[]) => durs.map((dur, index) => ({ dur, uri: `s${index}.ts` }));

describe('countSignatureHits', () => {
  it('按播放端同样的滑窗口径计数', () => {
    const fiveFours = [4, 4, 4, 4, 4];
    // 10 个 4 秒分片里，5 连窗有 6 个位置
    expect(countSignatureHits(segs([...fiveFours, ...fiveFours]), fiveFours)).toBe(6);
    // 中间插一个异值就只剩 2 个
    expect(countSignatureHits(segs([...fiveFours, 1, ...fiveFours]), fiveFours)).toBe(2);
  });

  it('广告形状在一集里只该命中一次', () => {
    const ad = [6.667, 2.133, 3.233, 5.433];
    expect(countSignatureHits(segs([...ad, 4, 4, 4]), ad)).toBe(1);
    // 只取前两段当特征也只能命中一次（滑动窗口按整段序列比）
    expect(countSignatureHits(segs([...ad, 4, 4, 4]), [6.667, 2.133])).toBe(1);
  });
});

describe('isRunInside', () => {
  it('短特征被长特征整段包含时返回 true', () => {
    expect(isRunInside([6.67, 2.13, 3.23, 5.43], [2.13, 3.23, 5.43])).toBe(true);
    expect(isRunInside([6.67, 2.13, 3.23, 5.43], [6.67, 2.13])).toBe(true);
    expect(isRunInside([5.57, 2.93, 5.7, 3.33, 1.53], [5.7, 3.33])).toBe(true);
  });

  it('长度不小于对方、或只是部分重叠时返回 false', () => {
    expect(isRunInside([6.67, 2.13], [6.67, 2.13])).toBe(false);
    expect(isRunInside([6.67, 2.13], [6.67, 2.13, 3.23])).toBe(false);
    expect(isRunInside([6.67, 2.13, 3.23], [6.67, 3.23])).toBe(false);
  });
});

describe('listCandidates 的片中单分片过滤', () => {
  it('片中的孤立单分片不产生候选，片头片尾的保留', () => {
    const { segments, boundaries } = parsePlaylist(
      [
        '#EXTM3U',
        '#EXTINF:6.000,',
        'a.ts',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:6.667,',
        'b.ts',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:6.000,',
        'c.ts',
        '#EXTINF:6.000,',
        'd.ts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    );
    const candidates = listCandidates(segments, boundaries);
    // 中间那个 6.667 秒分片单独成组，但不允许作为片中候选
    expect(candidates.some((c) => c.kind === 2 && c.durs.length === 1)).toBe(false);
    // 片头第一个分片（kind 1）与片尾整组（kind 3）仍可以入选
    expect(candidates.some((c) => c.kind === 1 && c.startIndex === 0)).toBe(true);
    expect(candidates.some((c) => c.kind === 3)).toBe(true);
  });
});
