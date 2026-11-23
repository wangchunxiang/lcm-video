import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETTINGS, settingDefault } from '@lcm/shared';

/**
 * 新库种子数据（`seeds/lcm_setting.sql`）必须与 `packages/shared/src/settings.ts` 的默认值一致。
 *
 * 这三处默认值曾经各写各的：`player_autoplay` 在种子里是 `'1'`、在服务端「缺行」回退里是 `false`，
 * 同一个开关两套默认，新库和缺行的库行为正好相反。现在默认值只认 `SETTINGS`，本测试守着不漂移。
 *
 * 路径按 cwd 找：`npm test` 在仓库根跑，单独在 `apps/server` 下跑 vitest 时是另一种相对位置。
 */
const CANDIDATES = [
  'apps/server/src/database/seeds/lcm_setting.sql',
  'src/database/seeds/lcm_setting.sql',
];

const seedPath = CANDIDATES.find((path) => existsSync(path)) ?? missingSeed();

function missingSeed(): never {
  throw new Error('找不到 lcm_setting.sql，测试必须在仓库内运行');
}

/** 种子行形如 `  ('site_name', '蓝草莓影视'),`；值里没有转义单引号，正则足够。 */
function parseSeed(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of readFileSync(seedPath, 'utf8').split('\n')) {
    const matched = /^\s*\('([^']+)',\s*'(.*)'\),?\s*$/.exec(line);
    if (matched === null) continue;
    const [, key, value] = matched;
    if (key !== undefined && value !== undefined) rows.set(key, value);
  }
  return rows;
}

describe('lcm_setting 种子数据', () => {
  const rows = parseSeed();

  it('能解析出全部行', () => {
    expect(rows.size).toBeGreaterThan(10);
  });

  it.each(SETTINGS.map((field) => [field.key, field.default] as const))(
    '%s 的种子值与 SETTINGS 默认值一致',
    (key, value) => {
      expect(rows.get(key)).toBe(value);
    },
  );

  it('settingDefault 覆盖 SETTINGS 全部键，未登记的键返回 undefined', () => {
    for (const field of SETTINGS) expect(settingDefault(field.key)).toBe(field.default);
    expect(settingDefault('not_exist')).toBeUndefined();
  });
});
