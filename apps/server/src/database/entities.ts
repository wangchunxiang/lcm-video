import { AdFeatureEntity } from '../modules/ad-feature/ad-feature.entity';
import { AdminUserEntity } from '../modules/admin-user/admin-user.entity';
import { CategoryEntity } from '../modules/category/category.entity';
import { CollectSourceCategoryEntity } from '../modules/collect-source-category/collect-source-category.entity';
import { CollectSourceEntity } from '../modules/collect-source/collect-source.entity';
import { CollectTaskLogDetailEntity } from '../modules/collect-task-log-detail/collect-task-log-detail.entity';
import { CollectTaskLogEntity } from '../modules/collect-task-log/collect-task-log.entity';
import { CollectTaskEntity } from '../modules/collect-task/collect-task.entity';
import { CoverCheckEntity } from '../modules/cover-check/cover-check.entity';
import { HomeHeroEntity } from '../modules/home-hero/home-hero.entity';
import { MergeRuleEntity } from '../modules/vod-merge-rule/vod-merge-rule.entity';
import { PlayLineEntity } from '../modules/play-line/play-line.entity';
import { SettingEntity } from '../modules/setting/setting.entity';
import { SourceRuleEntity } from '../modules/source-rule/source-rule.entity';
import { VodMergeIgnoreEntity } from '../modules/vod-merge-ignore/vod-merge-ignore.entity';
import { VodPlayEntity } from '../modules/vod-play/vod-play.entity';
import { VodEntity } from '../modules/vod/vod.entity';

/**
 * 实体清单：显式注册，不用 `entities: ['**\/*.entity.ts']` 这种 glob。
 *
 * glob 会在运行时用 `require` 逐个加载文件。生产环境读的是 dist 里的 `.js` 没问题，
 * 但 e2e 跑在 vitest + swc 下，glob 会 require 到 `.ts` 源码，而 Node 自带的类型擦除
 * 不支持装饰器，直接 `SyntaxError: Invalid or unexpected token`。
 * 显式清单还能让「新增实体忘了注册」变成编译期可见的问题（见 entities.test.ts）。
 */
export const ENTITIES = [
  AdFeatureEntity,
  AdminUserEntity,
  CategoryEntity,
  CollectSourceCategoryEntity,
  CollectSourceEntity,
  CollectTaskLogDetailEntity,
  CollectTaskLogEntity,
  CollectTaskEntity,
  CoverCheckEntity,
  HomeHeroEntity,
  MergeRuleEntity,
  PlayLineEntity,
  SettingEntity,
  SourceRuleEntity,
  VodMergeIgnoreEntity,
  VodPlayEntity,
  VodEntity,
];
