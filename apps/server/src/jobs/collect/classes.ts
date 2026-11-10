import type { SourceRuntime } from './types';
import { CollectClient } from './client';
import { parseClassList } from './parser';

export interface ClassFetchResult {
  classes: Array<{ typeId: string; typeName: string; typePid: string }>;
  via: string;
}

/**
 * 拉源站分类列表。
 *
 * v2 只走 JSON（决策 3.3 去掉了 XML）：统一用 `ac=list&at=json`，不再按 api_format
 * 分支，也不再去猜 `/at/json/` 的路径替换——旧站的兜底是当年兼容不同 CMS 的遗留，
 * 现在只需一个稳定约定，失败就把源站的原始错误带给后台。
 */
export async function fetchClassList(source: SourceRuntime): Promise<ClassFetchResult> {
  const client = new CollectClient(source);
  const raw = await client.request({ ac: 'list', at: 'json' });
  return { classes: parseClassList(raw), via: 'ac=list&at=json' };
}
