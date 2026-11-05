import { describe, expect, it } from 'vitest';
import { parseVodPage, splitPlayGroups } from './parser.ts';

describe('splitPlayGroups', () => {
  it('按 $$$ 拆分线路', () => {
    const groups = splitPlayGroups('liangzi$$$lzm3u8', 'a$http://x/1#b$http://x/2$$$c$http://y/1');
    expect(groups.map((g) => g.from)).toEqual(['liangzi', 'lzm3u8']);
    expect(groups[0]?.url).toBe('a$http://x/1#b$http://x/2');
    expect(groups[1]?.url).toBe('c$http://y/1');
  });

  it('线路名用逗号分隔、地址仍是 $$$ 时按逗号拆', () => {
    const groups = splitPlayGroups('liangzi,lzm3u8', 'a$http://x/1$$$b$http://y/1');
    expect(groups.map((g) => g.from)).toEqual(['liangzi', 'lzm3u8']);
  });

  it('逗号数量与地址组数不一致时保持原样', () => {
    const groups = splitPlayGroups('liangzi,lzm3u8', 'a$http://x/1');
    expect(groups.map((g) => g.from)).toEqual(['liangzi,lzm3u8']);
  });

  it('线路名为空时用 default', () => {
    const groups = splitPlayGroups('', 'a$http://x/1$$$b$http://y/1');
    expect(groups.map((g) => g.from)).toEqual(['default', 'default']);
  });

  it('跳过没有地址的分组', () => {
    const groups = splitPlayGroups('a$$$b', 'x$http://x/1$$$$$$');
    expect(groups.map((g) => g.from)).toEqual(['a']);
  });
});

describe('parseVodPage', () => {
  it('解析 JSON 数据列表并保留播放字段', () => {
    const page = parseVodPage(
      {
        page: 2,
        pagecount: 10,
        total: 200,
        list: [
          {
            vod_id: 7,
            vod_name: '测试影片',
            vod_play_from: 'liangzi$$$lzm3u8',
            vod_play_url: '第01集$https://a.com/s/1$$$第01集$https://a.com/1/index.m3u8',
            vod_year: '2024',
            vod_time: '2024-05-01 10:00:00',
          },
        ],
      },
      'json',
    );
    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(10);
    expect(page.list).toHaveLength(1);
    expect(page.list[0]?.playFrom).toBe('liangzi$$$lzm3u8');
    expect(page.list[0]?.year).toBe(2024);
  });
});
