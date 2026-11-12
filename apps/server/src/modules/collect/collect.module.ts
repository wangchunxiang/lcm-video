import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { CollectSourceCategoryEntity } from '../collect-source-category/collect-source-category.entity';
import { CollectSourceEntity } from '../collect-source/collect-source.entity';
import { CollectTaskLogDetailEntity } from '../collect-task-log-detail/collect-task-log-detail.entity';
import { CollectTaskLogEntity } from '../collect-task-log/collect-task-log.entity';
import { CollectTaskEntity } from '../collect-task/collect-task.entity';
import { CoverCheckEntity } from '../cover-check/cover-check.entity';
import { MergeRuleEntity } from '../vod-merge-rule/vod-merge-rule.entity';
import { PlayLineEntity } from '../play-line/play-line.entity';
import { SettingEntity } from '../setting/setting.entity';
import { SourceRuleEntity } from '../source-rule/source-rule.entity';
import { VodPlayEntity } from '../vod-play/vod-play.entity';
import { VodEntity } from '../vod/vod.entity';
import { CollectRunner } from './runner';
import { CollectScheduler } from './scheduler';

/** 采集引擎：任务调度、逐页执行、写库 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CollectTaskEntity,
      CollectTaskLogEntity,
      CollectTaskLogDetailEntity,
      CollectSourceEntity,
      CollectSourceCategoryEntity,
      CategoryEntity,
      SettingEntity,
      CoverCheckEntity,
      MergeRuleEntity,
      SourceRuleEntity,
      PlayLineEntity,
      VodEntity,
      VodPlayEntity,
    ]),
  ],
  providers: [CollectRunner, CollectScheduler],
  exports: [CollectRunner, CollectScheduler],
})
export class CollectModule {}
