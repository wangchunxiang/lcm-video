import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectTaskLogDetailEntity } from './collect-task-log-detail.entity';
import { CollectTaskLogDetailController } from './collect-task-log-detail.controller';
import { CollectTaskLogDetailService } from './collect-task-log-detail.service';

@Module({
  imports: [TypeOrmModule.forFeature([CollectTaskLogDetailEntity])],
  controllers: [CollectTaskLogDetailController],
  providers: [CollectTaskLogDetailService],
  exports: [CollectTaskLogDetailService],
})
export class CollectTaskLogDetailModule {}
