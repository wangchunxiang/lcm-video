import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VodMergeIgnoreEntity } from './vod-merge-ignore.entity';
import { VodMergeIgnoreController } from './vod-merge-ignore.controller';
import { VodMergeIgnoreService } from './vod-merge-ignore.service';

@Module({
  imports: [TypeOrmModule.forFeature([VodMergeIgnoreEntity])],
  controllers: [VodMergeIgnoreController],
  providers: [VodMergeIgnoreService],
  exports: [VodMergeIgnoreService],
})
export class VodMergeIgnoreModule {}
