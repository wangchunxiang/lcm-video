import { Module } from '@nestjs/common';
import { VodController } from './vod.controller';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { VodService } from './vod.service';

@Module({
  imports: [CollectSourceModule],
  controllers: [VodController],
  providers: [VodService],
  exports: [VodService],
})
export class VodModule {}
