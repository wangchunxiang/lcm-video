import { Module } from '@nestjs/common';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { CollectTaskLogDetailModule } from '../collect-task-log-detail/collect-task-log-detail.module';
import { CollectModule } from '../../jobs/collect/collect.module.js';
import { CollectTaskLogController } from './collect-task-log.controller';
import { CollectTaskLogService } from './collect-task-log.service';

@Module({
  imports: [CollectSourceModule, CollectTaskLogDetailModule, CollectModule],
  controllers: [CollectTaskLogController],
  providers: [CollectTaskLogService],
  exports: [CollectTaskLogService],
})
export class CollectTaskLogModule {}
