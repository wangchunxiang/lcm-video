import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { SourceRuleEntity } from './source-rule.entity';
import { SourceRuleController } from './source-rule.controller';
import { SourceRuleService } from './source-rule.service';

@Module({
  imports: [TypeOrmModule.forFeature([SourceRuleEntity]), CollectSourceModule],
  controllers: [SourceRuleController],
  providers: [SourceRuleService],
  exports: [SourceRuleService],
})
export class SourceRuleModule {}
