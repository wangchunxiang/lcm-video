/** 采集接口响应的解析：把 JSON / XML 统一成本程序内部的结构。 */

export interface SourceVod {
  vodId: string;
  name: string;
  typeId: string;
  typeName: string;
  subName: string;
  letter: string;
  cover: string;
  actor: string;
  director: string;
  writer: string;
  intro: string;
  content: string;
  remarks: string;
  releaseDate: string;
  episodeCount: number;
  area: string;
  lang: string;
  year: number;
  updatedAt: Date | null;
  playFrom: string;
  playUrl: string;
}

export interface VodPage {
  page: number;
  pageCount: number;
  total: number;
  list: SourceVod[];
}

export interface SourceClass {
  typeId: string;
  typeName: string;
  typePid: string;
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 取 XML 节点的文本：兼容 CDATA、#text、纯字符串与数字 */
function textOf(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (isDict(node)) {
    if (typeof node['__cdata'] === 'string') return node['__cdata'];
    if (typeof node['#text'] === 'string') return node['#text'];
  }
  return '';
}

function str(value: unknown): string {
  return textOf(value).trim();
}

function num(value: unknown): number {
  const n = Number(textOf(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function parseDate(value: unknown): Date | null {
  const raw = str(value);
  if (!raw) return null;
  const date = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pick(row: Dict, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

/* ------------------------------- XML 定位 ------------------------------- */

function xmlRoot(raw: unknown): Dict {
  if (!isDict(raw)) return {};
  const rss = raw['rss'];
  return isDict(rss) ? rss : raw;
}

function xmlList(raw: unknown): Dict {
  const root = xmlRoot(raw);
  const list = root['list'];
  if (isDict(list)) return list;
  return root;
}

function xmlVideos(raw: unknown): Dict[] {
  const list = xmlList(raw);
  const video = list['video'];
  if (Array.isArray(video)) return video.filter(isDict);
  if (isDict(video)) return [video];
  return [];
}

function xmlAttr(node: Dict, name: string): string {
  const value = node[`@_${name}`];
  return value === undefined ? '' : textOf(value).trim();
}

/** XML 的播放数据：<dl><dd flag="lzm3u8">剧集串</dd></dl> */
function xmlPlay(node: Dict): { playFrom: string; playUrl: string } {
  const dl = node['dl'];
  if (!isDict(dl)) return { playFrom: '', playUrl: '' };
  const dd = dl['dd'];
  const items = Array.isArray(dd) ? dd.filter(isDict) : isDict(dd) ? [dd] : [];
  const froms: string[] = [];
  const urls: string[] = [];
  for (const item of items) {
    const flag = xmlAttr(item, 'flag');
    const url = textOf(item).trim();
    if (!flag || !url) continue;
    froms.push(flag);
    urls.push(url);
  }
  return { playFrom: froms.join('$$$'), playUrl: urls.join('$$$') };
}

/* ------------------------------- 影片解析 ------------------------------- */

function fromJsonVod(row: Dict): SourceVod {
  return {
    vodId: str(pick(row, ['vod_id'])),
    name: str(pick(row, ['vod_name'])),
    typeId: str(pick(row, ['type_id'])),
    typeName: str(pick(row, ['type_name'])),
    subName: str(pick(row, ['vod_sub'])),
    letter: str(pick(row, ['vod_letter'])).toUpperCase(),
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

function fromXmlVod(node: Dict): SourceVod {
  const play = xmlPlay(node);
  return {
    vodId: str(node['id']),
    name: str(node['name']),
    typeId: str(node['tid']),
    typeName: str(node['type']),
    subName: str(node['sub']),
    letter: str(node['letter']).toUpperCase(),
    cover: str(node['pic']),
    actor: str(node['actor']),
    director: str(node['director']),
    writer: str(node['writer']),
    intro: str(node['blurb']),
    content: str(node['des']),
    remarks: str(node['note']),
    releaseDate: str(node['pubdate']),
    episodeCount: num(node['total']),
    area: str(node['area']),
    lang: str(node['lang']),
    year: num(node['year']),
    updatedAt: parseDate(node['last'] ?? node['time']),
    playFrom: play.playFrom,
    playUrl: play.playUrl,
  };
}

export function parseVodPage(raw: unknown, format: string): VodPage {
  if (format === 'xml') {
    const list = xmlList(raw);
    return {
      page: num(list['@_page']),
      pageCount: num(list['@_pagecount']),
      total: num(list['@_recordcount']),
      list: xmlVideos(raw).map(fromXmlVod),
    };
  }

  const root = isDict(raw) ? raw : {};
  const rows = Array.isArray(root['list']) ? (root['list'] as unknown[]).filter(isDict) : [];
  return {
    page: num(root['page']),
    pageCount: num(root['pagecount']),
    total: num(root['total']),
    list: rows.map(fromJsonVod),
  };
}

/* ------------------------------- 分类解析 ------------------------------- */

export function parseClassList(raw: unknown, format: string): SourceClass[] {
  if (format === 'xml') {
    const root = xmlRoot(raw);
    const classNode = root['class'];
    if (!isDict(classNode)) return [];
    const ty = classNode['ty'];
    const items = Array.isArray(ty) ? ty.filter(isDict) : isDict(ty) ? [ty] : [];
    return items
      .map((node) => ({ typeId: xmlAttr(node, 'id'), typeName: textOf(node).trim(), typePid: xmlAttr(node, 'pid') }))
      .filter((item) => item.typeId !== '' && item.typeName !== '');
  }

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

/** 只取线路名（不关心地址）：按 $$$ 拆，兼容逗号分隔 */
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

/** 拆分播放组：`vod_play_from` 与 `vod_play_url` 都按 $$$ 分组 */
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
