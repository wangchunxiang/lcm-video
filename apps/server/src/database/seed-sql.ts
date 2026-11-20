/**
 * 种子 SQL 的极简解析：去掉 `--` 注释行，按 `;` 切成可执行语句。
 *
 * 与 `seed.ts` 共用。种子文件都是「注释 + 一条/多条 INSERT」，没有存储过程、
 * 没有字符串里的分号，所以不需要完整的 SQL 解析器。
 */
export function parseStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}
