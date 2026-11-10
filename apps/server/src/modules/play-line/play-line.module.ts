import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayLineEntity } from './play-line.entity';
import { PlayLineController } from './play-line.controller';
import { PlayLineService } from './play-line.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlayLineEntity])],
  controllers: [PlayLineController],
  providers: [PlayLineService],
  exports: [PlayLineService],
})
export class PlayLineModule {}
