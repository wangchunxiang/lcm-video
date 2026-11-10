import { Module } from '@nestjs/common';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { VodMergeIgnoreModule } from '../vod-merge-ignore/vod-merge-ignore.module';
import { VodController } from './vod.controller';
import { VodMergeController } from './vod-merge.controller';
import { VodMergeService } from './vod-merge.service';
import { VodService } from './vod.service';

@Module({
  imports: [CollectSourceModule, VodMergeIgnoreModule],
  controllers: [VodController, VodMergeController],
  providers: [VodService, VodMergeService],
  exports: [VodService],
})
export class VodModule {}
