import { Module } from '@nestjs/common';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { CollectModule } from '../../jobs/collect/collect.module.js';
import { CollectTaskController } from './collect-task.controller';
import { CollectTaskService } from './collect-task.service';

@Module({
  imports: [CollectSourceModule, CollectModule],
  controllers: [CollectTaskController],
  providers: [CollectTaskService],
})
export class CollectTaskModule {}
