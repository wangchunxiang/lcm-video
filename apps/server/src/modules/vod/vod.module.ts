import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { CoverCheckEntity } from '../cover-check/cover-check.entity';
import { SettingEntity } from '../setting/setting.entity';
import { VodEntity } from './vod.entity';
import { VodController } from './vod.controller';
import { VodMergeController } from './vod-merge.controller';
import { VodMergeService } from './vod-merge.service';
import { VodService } from './vod.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VodEntity, CategoryEntity, SettingEntity, CoverCheckEntity]),
  ],
  controllers: [VodController, VodMergeController],
  providers: [VodService, VodMergeService],
  exports: [VodService],
})
export class VodModule {}
