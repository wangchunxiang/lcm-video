import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations/index';

/** 从当前工作目录往上找 `apps/server/src`（`npm test` 在根目录跑，`vitest` 也可能在 apps/server 下跑）。 */
function findServerSource(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, 'apps/server/src/modules'))) return join(dir, 'apps/server/src');
    if (existsSync(join(dir, 'src/modules'))) return join(dir, 'src');
    dir = dirname(dir);
  }
  throw new Error('找不到 apps/server/src，测试必须在仓库内运行');
}

const root = findServerSource(process.cwd());

function walk(dir: string, pattern: RegExp, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, pattern, found);
    else if (pattern.test(name)) found.push(full);
  }
  return found;
}

function declaredClasses(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/^export class (\w+)/gm)].map(
    (match) => match[1] ?? '',
  );
}

describe('实体与迁移的显式注册清单', () => {
  it('modules 下的每个 *.entity.ts 都进了 ENTITIES', () => {
    const files = walk(join(root, 'modules'), /\.entity\.ts$/);
    expect(files.length).toBeGreaterThan(0);

    const registered = new Set(ENTITIES.map((entity) => entity.name));
    const missing = files.flatMap((file) =>
      declaredClasses(file).filter((name) => !registered.has(name)),
    );

    expect(missing).toEqual([]);
  });

  it('database/migrations 下的每个迁移都进了 MIGRATIONS', () => {
    const files = walk(join(root, 'database/migrations'), /^\d+-\w+\.ts$/);

    const registered = new Set(MIGRATIONS.map((migration) => migration.name));
    const missing = files.flatMap((file) =>
      declaredClasses(file).filter((name) => !registered.has(name)),
    );

    expect(missing).toEqual([]);
  });
});
