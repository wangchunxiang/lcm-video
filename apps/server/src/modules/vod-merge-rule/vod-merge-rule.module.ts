import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingEntity } from '../setting/setting.entity';
import { MergeRuleEntity } from './vod-merge-rule.entity';
import { VodMergeRuleController } from './vod-merge-rule.controller';
import { VodMergeRuleService } from './vod-merge-rule.service';

/** 入库合并规则：规则表 + 读写接口。 */
@Module({
  imports: [TypeOrmModule.forFeature([MergeRuleEntity, SettingEntity])],
  controllers: [VodMergeRuleController],
  providers: [VodMergeRuleService],
  exports: [VodMergeRuleService],
})
export class VodMergeRuleModule {}
