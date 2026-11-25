import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { VodMergeService } from './vod-merge.service';

interface MemberRow {
  id: string;
  name: string;
  subName: string | null;
  year: number;
  status: number;
  cover: string | null;
  nameHash: string;
  area: string | null;
  lang: string | null;
  actor: string | null;
  episodeCount: number;
  categoryName: string | null;
  collectedAt: Date | null;
  playCount: string;
  epTotal: string;
}

function memberRow(id: string, actor = '张三,李四'): MemberRow {
  return {
    id,
    name: '同名作品',
    subName: null,
    year: 2026,
    status: 1,
    cover: '',
    nameHash: 'strict-hash',
    area: '大陆',
    lang: '国语',
    actor,
    episodeCount: 2,
    categoryName: '电视剧',
    collectedAt: new Date('2026-11-20T10:00:00Z'),
    playCount: '1',
    epTotal: '2',
  };
}

/**
 * 假 DataSource：只认 `loadGroupDetail` 会发的四条 SQL，并按需返回数据。
 * `memberQueries` 记录「取成员」（带 `LEFT JOIN lcm_category` 的那条）执行了几次，
 * 用来守住「宽松键分支复用已查到的成员」这个优化。
 */
function fakeDataSource(input: { strictIds: string[]; looseIds: string[] }) {
  const state = { memberQueries: 0, memberQueriesFor: [] as string[][] };

  const query = async (sql: string, params: unknown[]): Promise<unknown> => {
    // 严格键与宽松键合成一条查询，`strict` 标记是否命中严格键
    if (sql.includes('name_hash = ? OR name_hash_loose = ?')) {
      const strictIds = new Set(input.strictIds);
      return [
        ...input.strictIds.map((id) => ({ id, strict: 1 })),
        ...input.looseIds.filter((id) => !strictIds.has(id)).map((id) => ({ id, strict: 0 })),
      ];
    }
    if (sql.includes('LEFT JOIN lcm_category')) {
      const ids = (params[0] ?? []) as string[];
      state.memberQueries += 1;
      state.memberQueriesFor.push(ids);
      return ids.map((id) => memberRow(id));
    }
    if (sql.includes('FROM lcm_vod_play')) {
      return [];
    }
    throw new Error(`未预期的 SQL：${sql}`);
  };

  return { dataSource: { query } as unknown as DataSource, state };
}

/** `loadGroupDetail` 是私有方法，测试里直接取出来调 */
function loadDetail(service: VodMergeService, key: string): Promise<unknown> {
  const expose = service as unknown as {
    loadGroupDetail(kind: string, key: string): Promise<unknown>;
  };
  return expose.loadGroupDetail('auto', key);
}

describe('VodMergeService.loadGroupDetail', () => {
  it('宽松键成员更多且判定通过时，成员只查一次', async () => {
    const { dataSource, state } = fakeDataSource({
      strictIds: ['1', '2'],
      looseIds: ['1', '2', '3'],
    });
    const service = new VodMergeService(dataSource);

    const group = (await loadDetail(service, 'strict-hash~2026')) as {
      members: Array<{ id: string }>;
    };

    // 用了宽松组（3 个成员）
    expect(group.members.map((member) => member.id)).toEqual(['1', '2', '3']);
    // 判定用的那批成员被复用：从两次查询降为一次
    expect(state.memberQueries).toBe(1);
    expect(state.memberQueriesFor).toEqual([['1', '2', '3']]);
  });

  it('宽松键成员不比严格键多时，仍只查一次成员', async () => {
    const { dataSource, state } = fakeDataSource({
      strictIds: ['1', '2'],
      looseIds: ['1', '2'],
    });
    const service = new VodMergeService(dataSource);

    const group = (await loadDetail(service, 'strict-hash~2026')) as {
      members: Array<{ id: string }>;
    };

    expect(group.members.map((member) => member.id)).toEqual(['1', '2']);
    expect(state.memberQueries).toBe(1);
    expect(state.memberQueriesFor).toEqual([['1', '2']]);
  });

  it('宽松键成员演员重叠不够时不采用，回退严格组', async () => {
    const { dataSource } = fakeDataSource({
      strictIds: ['1', '2'],
      looseIds: ['1', '2', '3'],
    });
    // 让第三个人的演员完全不重叠：actorOverlap 掉到 0，判定失败
    const counting = dataSource as unknown as {
      query(sql: string, params?: unknown[]): Promise<unknown>;
    };
    const patched = {
      query: async (sql: string, params?: unknown[]): Promise<unknown> => {
        const rows = (await counting.query(sql, params)) as MemberRow[];
        if (sql.includes('LEFT JOIN lcm_category')) {
          return rows.map((row) => (row.id === '3' ? memberRow('3', '王五,赵六') : row));
        }
        return rows;
      },
    } as unknown as DataSource;
    const service = new VodMergeService(patched);

    const group = (await loadDetail(service, 'strict-hash~2026')) as {
      members: Array<{ id: string }>;
    };

    expect(group.members.map((member) => member.id)).toEqual(['1', '2']);
  });
});
