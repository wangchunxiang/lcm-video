import { Module } from '@nestjs/common';
import { VodPlayController } from './vod-play.controller';
import { VodPlayService } from './vod-play.service';

/** 影片线路表：一条记录 = 某影片的一条线路，play_url 里是整串剧集。 */
@Module({
  controllers: [VodPlayController],
  providers: [VodPlayService],
  exports: [VodPlayService],
})
export class VodPlayModule {}
