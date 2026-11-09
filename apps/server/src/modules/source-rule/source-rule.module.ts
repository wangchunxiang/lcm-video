import { Module } from '@nestjs/common';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { SourceRuleController } from './source-rule.controller';
import { SourceRuleService } from './source-rule.service';

/** 地址替换规则，属于某个采集源；采集写库前套用，也可对历史数据重刷。 */
@Module({
  imports: [CollectSourceModule],
  controllers: [SourceRuleController],
  providers: [SourceRuleService],
  exports: [SourceRuleService],
})
export class SourceRuleModule {}
