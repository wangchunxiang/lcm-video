import type { SourceClass, SourceVod, VodPage } from './types';

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOf = (node: unknown): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  return '';
};

const str = (value: unknown): string => textOf(value).trim();

const num = (value: unknown): number => {
  const n = Number(textOf(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const parseDate = (value: unknown): Date | null => {
  const raw = str(value);
  if (!raw) return null;
  const date = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

const pick = (row: Dict, keys: string[]): unknown => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
};

function fromJsonVod(row: Dict): SourceVod {
  return {
    vodId: str(pick(row, ['vod_id'])),
    name: str(pick(row, ['vod_name'])),
    typeId: str(pick(row, ['type_id'])),
    typeName: str(pick(row, ['type_name'])),
    typePid: str(pick(row, ['type_pid'])),
    subName: str(pick(row, ['vod_sub'])),
    cover: str(pick(row, ['vod_pic'])),
    actor: str(pick(row, ['vod_actor'])),
    director: str(pick(row, ['vod_director'])),
    writer: str(pick(row, ['vod_writer'])),
    intro: str(pick(row, ['vod_blurb'])),
    content: str(pick(row, ['vod_content'])),
    remarks: str(pick(row, ['vod_remarks'])),
    releaseDate: str(pick(row, ['vod_pubdate'])),
    episodeCount: num(pick(row, ['vod_total'])),
    area: str(pick(row, ['vod_area'])),
    lang: str(pick(row, ['vod_lang'])),
    year: num(pick(row, ['vod_year'])),
    updatedAt: parseDate(pick(row, ['vod_time'])),
    playFrom: str(pick(row, ['vod_play_from'])),
    playUrl: str(pick(row, ['vod_play_url'])),
  };
}

/** 解析一页影片列表（JSON 接口）。 */
export function parseVodPage(raw: unknown): VodPage {
  const root = isDict(raw) ? raw : {};
  const rows = Array.isArray(root['list']) ? (root['list'] as unknown[]).filter(isDict) : [];
  return {
    page: num(root['page']),
    pageCount: num(root['pagecount']),
    total: num(root['total']),
    list: rows.map(fromJsonVod),
  };
}

/** 解析分类列表（JSON 接口）。 */
export function parseClassList(raw: unknown): SourceClass[] {
  const root = isDict(raw) ? raw : {};
  const rows = Array.isArray(root['class']) ? (root['class'] as unknown[]).filter(isDict) : [];
  return rows
    .map((row) => ({
      typeId: str(pick(row, ['type_id'])),
      typeName: str(pick(row, ['type_name'])),
      typePid: str(pick(row, ['type_pid'])),
    }))
    .filter((item) => item.typeId !== '' && item.typeName !== '');
}

/**
 * 拆分线路名：正常按 `$$$`；
 * 少数源把多条线路名写成逗号分隔（地址仍是 $$$），数量能对上时按逗号拆。
 */
function splitPlayFrom(playFrom: string, urlCount: number): string[] {
  if (!playFrom) return [];
  const byDollar = playFrom.split('$$$');
  if (byDollar.length > 1 || urlCount <= 1) return byDollar;
  const byComma = playFrom
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return byComma.length === urlCount ? byComma : byDollar;
}

/** 只取线路名（不关心地址）：按 $$$ 拆，兼容逗号分隔。 */
export function splitLineNames(playFrom: string): string[] {
  if (!playFrom) return [];
  const names: string[] = [];
  for (const group of playFrom.split('$$$')) {
    for (const name of group.split(',')) {
      const value = name.trim();
      if (value) names.push(value);
    }
  }
  return names;
}

/** 拆分播放组：`vod_play_from` 与 `vod_play_url` 都按 $$$ 分组。 */
export function splitPlayGroups(playFrom: string, playUrl: string): Array<{ from: string; url: string }> {
  const urls = playUrl ? playUrl.split('$$$') : [];
  const froms = splitPlayFrom(playFrom, urls.length);
  const groups: Array<{ from: string; url: string }> = [];
  const size = Math.max(froms.length, urls.length);
  for (let i = 0; i < size; i++) {
    const url = (urls[i] ?? '').trim();
    if (!url) continue;
    const from = (froms[i] ?? '').trim() || 'default';
    groups.push({ from, url });
  }
  return groups;
}
