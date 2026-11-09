import { Module } from '@nestjs/common';
import { CollectSourceController } from './collect-source.controller';
import { CollectModule } from '../../jobs/collect/collect.module.js';
import { CollectSourceService } from './collect-source.service';

@Module({
  imports: [CollectModule],
  controllers: [CollectSourceController],
  providers: [CollectSourceService],
  exports: [CollectSourceService],
})
export class CollectSourceModule {}
