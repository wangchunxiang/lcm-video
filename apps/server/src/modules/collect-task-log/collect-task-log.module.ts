import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectTaskLogEntity } from './collect-task-log.entity';
import { CollectTaskLogController } from './collect-task-log.controller';
import { CollectTaskLogService } from './collect-task-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([CollectTaskLogEntity])],
  controllers: [CollectTaskLogController],
  providers: [CollectTaskLogService],
  exports: [CollectTaskLogService],
})
export class CollectTaskLogModule {}
