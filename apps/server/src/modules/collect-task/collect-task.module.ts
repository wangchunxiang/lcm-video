import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectModule } from '../../jobs/collect/collect.module';
import { CollectTaskEntity } from './collect-task.entity';
import { CollectTaskController } from './collect-task.controller';
import { CollectTaskService } from './collect-task.service';

@Module({
  imports: [TypeOrmModule.forFeature([CollectTaskEntity]), CollectModule],
  controllers: [CollectTaskController],
  providers: [CollectTaskService],
  exports: [CollectTaskService],
})
export class CollectTaskModule {}
