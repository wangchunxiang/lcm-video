import { Init1794310399174 } from './1794310399174-init';
import { VodMergeRule1794400000000 } from './1794400000000-vod-merge-rule';

/**
 * 迁移清单：显式注册，理由同 `../entities.ts`（glob 在 e2e 里会 require 到 `.ts`）。
 * 新增迁移时加在这里，顺序按时间戳升序。
 */
export const MIGRATIONS = [Init1794310399174, VodMergeRule1794400000000];
