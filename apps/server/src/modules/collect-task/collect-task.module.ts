import { Module } from '@nestjs/common';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { CollectTaskController } from './collect-task.controller';
import { CollectTaskService } from './collect-task.service';

@Module({
  imports: [CollectSourceModule],
  controllers: [CollectTaskController],
  providers: [CollectTaskService],
})
export class CollectTaskModule {}
