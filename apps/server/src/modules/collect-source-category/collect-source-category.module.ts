import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectSourceCategoryEntity } from './collect-source-category.entity';
import { CollectSourceCategoryController } from './collect-source-category.controller';
import { CollectSourceCategoryService } from './collect-source-category.service';

@Module({
  imports: [TypeOrmModule.forFeature([CollectSourceCategoryEntity])],
  controllers: [CollectSourceCategoryController],
  providers: [CollectSourceCategoryService],
  exports: [CollectSourceCategoryService],
})
export class CollectSourceCategoryModule {}
