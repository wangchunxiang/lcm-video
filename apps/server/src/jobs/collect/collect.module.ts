import { Module } from '@nestjs/common';
import { CollectRunner } from './runner.js';
import { CollectScheduler } from './scheduler.js';

/** 采集引擎：任务调度、逐页执行、写库 */
@Module({
  providers: [CollectRunner, CollectScheduler],
  exports: [CollectRunner],
})
export class CollectModule {}
