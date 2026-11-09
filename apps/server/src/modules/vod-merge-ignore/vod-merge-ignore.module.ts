import { Module } from '@nestjs/common';
import { VodMergeIgnoreController } from './vod-merge-ignore.controller';
import { VodMergeIgnoreService } from './vod-merge-ignore.service';

@Module({
  controllers: [VodMergeIgnoreController],
  providers: [VodMergeIgnoreService],
  exports: [VodMergeIgnoreService],
})
export class VodMergeIgnoreModule {}
