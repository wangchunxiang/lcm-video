import { Init1794310399174 } from './1794310399174-init';
import { VodMergeRule1794400000000 } from './1794400000000-vod-merge-rule';
import { WidenReleaseDate1794400001000 } from './1794400001000-widen-release-date';
import { SourceRuleComments1794400002000 } from './1794400002000-source-rule-comments';
import { MergePreviewIndexes1794400003000 } from './1794400003000-merge-preview-indexes';
import { PortalListIndexes1794400005000 } from './1794400005000-portal-list-indexes';
import { DropObsoleteSettings1794400006000 } from './1794400006000-drop-obsolete-settings';
import { SourceRuleMultiFrom1794400007000 } from './1794400007000-source-rule-multi-from';
import { NormalizeCoverHost1794400008000 } from './1794400008000-normalize-cover-host';
import { PlayLineSource1794400009000 } from './1794400009000-play-line-source';

/**
 * 迁移清单：显式注册，理由同 `../entities.ts`（glob 在 e2e 里会 require 到 `.ts`）。
 * 新增迁移时加在这里，顺序按时间戳升序。
 */
export const MIGRATIONS = [
  Init1794310399174,
  VodMergeRule1794400000000,
  WidenReleaseDate1794400001000,
  SourceRuleComments1794400002000,
  MergePreviewIndexes1794400003000,
  PortalListIndexes1794400005000,
  DropObsoleteSettings1794400006000,
  SourceRuleMultiFrom1794400007000,
  NormalizeCoverHost1794400008000,
  PlayLineSource1794400009000,
];
