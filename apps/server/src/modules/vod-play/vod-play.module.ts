import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VodPlayEntity } from './vod-play.entity';
import { VodPlayController } from './vod-play.controller';
import { VodPlayService } from './vod-play.service';

@Module({
  imports: [TypeOrmModule.forFeature([VodPlayEntity])],
  controllers: [VodPlayController],
  providers: [VodPlayService],
  exports: [VodPlayService],
})
export class VodPlayModule {}
