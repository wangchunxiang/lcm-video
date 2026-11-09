import { Module } from '@nestjs/common';
import { CollectSourceController } from './collect-source.controller';
import { CollectSourceService } from './collect-source.service';

@Module({
  controllers: [CollectSourceController],
  providers: [CollectSourceService],
  exports: [CollectSourceService],
})
export class CollectSourceModule {}
