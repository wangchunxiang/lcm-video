import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { VodEntity } from './vod.entity';
import { VodController } from './vod.controller';
import { VodService } from './vod.service';

@Module({
  imports: [TypeOrmModule.forFeature([VodEntity, CategoryEntity])],
  controllers: [VodController],
  providers: [VodService],
  exports: [VodService],
})
export class VodModule {}
