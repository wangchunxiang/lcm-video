import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceRuleEntity } from './source-rule.entity';
import { SourceRuleController } from './source-rule.controller';
import { SourceRuleService } from './source-rule.service';

@Module({
  imports: [TypeOrmModule.forFeature([SourceRuleEntity])],
  controllers: [SourceRuleController],
  providers: [SourceRuleService],
  exports: [SourceRuleService],
})
export class SourceRuleModule {}
