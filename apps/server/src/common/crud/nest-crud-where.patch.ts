/**
 * nest-crud 2.5.2 的 where 只认实体属性名，却把属性名原样当列名拼进 SQL：
 * `WhereQueryBuilder.defaultResolver` 调 `getFieldWithAlias(key)` 时没传 `useDbField`。
 *
 * 我们的实体属性是 camelCase、列是 snake_case（`sourceId` → `source_id`），于是任何
 * 属性名与列名不一致的过滤都会报 `Unknown column 'X.sourceId'`。
 *
 * 这里给 `build()` 注入一个按数据库列名取字段的 resolver；字段合法性仍由
 * `isAllowedField()` 按实体属性名校验，所以传 snake_case 依旧会被拒绝。
 */
import { WhereQueryBuilder } from '@ackplus/nest-crud/dist/lib/helper/where-query-builder';

interface PatchedBuilder {
  helper: {
    getFieldWithAlias: (field: string, useDbField?: boolean) => string;
    isAllowedField: (field: string) => boolean;
  };
  build: (
    whereObject: unknown,
    resolver?: (key: string) => { expr: string; allowed: boolean },
  ) => unknown;
}

const prototype = WhereQueryBuilder.prototype as unknown as PatchedBuilder;
const originalBuild = prototype.build;

prototype.build = function patchedBuild(
  this: PatchedBuilder,
  whereObject: unknown,
  resolver?: (key: string) => { expr: string; allowed: boolean },
): unknown {
  const byDatabaseColumn = (key: string) => ({
    expr: this.helper.getFieldWithAlias(key, true),
    allowed: this.helper.isAllowedField(key),
  });
  return originalBuild.call(this, whereObject, resolver ?? byDatabaseColumn);
};
