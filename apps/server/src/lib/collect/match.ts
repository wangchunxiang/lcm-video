import type { Db } from '@lcm/db';
import { category } from '@lcm/db';
import type { CategoryInfo } from './writer.ts';

/** 载入本站分类，供自动匹配与写入时查父分类用 */
export async function loadCategories(db: Db): Promise<CategoryInfo[]> {
  const rows = await db
    .select({
      id: category.id,
      pid: category.pid,
      name: category.name,
      matchNames: category.matchNames,
    })
    .from(category);

  return rows.map((row) => ({
    id: row.id,
    pid: row.pid,
    name: row.name,
    matchNames: row.matchNames
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  }));
}

/**
 * 自动匹配只做两步：先比 match_names，再比分类名称完全相等。
 * 不继承父分类，也不做包含匹配。
 */
export function autoMatchCategory(sourceTypeName: string, categories: CategoryInfo[]): number {
  const name = sourceTypeName.trim();
  if (!name) return 0;

  for (const item of categories) {
    if (item.matchNames.includes(name)) return item.id;
  }
  for (const item of categories) {
    if (item.name === name) return item.id;
  }
  return 0;
}
