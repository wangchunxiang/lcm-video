import { Module } from '@nestjs/common';
import { CollectTaskLogDetailController } from './collect-task-log-detail.controller';
import { CollectTaskLogDetailService } from './collect-task-log-detail.service';

@Module({
  controllers: [CollectTaskLogDetailController],
  providers: [CollectTaskLogDetailService],
  exports: [CollectTaskLogDetailService],
})
export class CollectTaskLogDetailModule {}
