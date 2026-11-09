import { Module } from '@nestjs/common';
import { PlayLineController } from './play-line.controller';
import { PlayLineService } from './play-line.service';

/** 线路表：前台按 sort 展示，停用是全局开关。 */
@Module({
  controllers: [PlayLineController],
  providers: [PlayLineService],
  exports: [PlayLineService],
})
export class PlayLineModule {}
