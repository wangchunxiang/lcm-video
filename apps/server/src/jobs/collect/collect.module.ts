import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../../modules/category/category.entity';
import { CollectSourceCategoryEntity } from '../../modules/collect-source-category/collect-source-category.entity';
import { CollectSourceEntity } from '../../modules/collect-source/collect-source.entity';
import { CollectTaskLogDetailEntity } from '../../modules/collect-task-log-detail/collect-task-log-detail.entity';
import { CollectTaskLogEntity } from '../../modules/collect-task-log/collect-task-log.entity';
import { CollectTaskEntity } from '../../modules/collect-task/collect-task.entity';
import { CoverCheckEntity } from '../../modules/cover-check/cover-check.entity';
import { PlayLineEntity } from '../../modules/play-line/play-line.entity';
import { SettingEntity } from '../../modules/setting/setting.entity';
import { SourceRuleEntity } from '../../modules/source-rule/source-rule.entity';
import { VodPlayEntity } from '../../modules/vod-play/vod-play.entity';
import { VodEntity } from '../../modules/vod/vod.entity';
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
