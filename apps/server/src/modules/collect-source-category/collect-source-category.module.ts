import { Module } from '@nestjs/common';
import { CollectSourceCategoryController } from './collect-source-category.controller';
import { CollectSourceCategoryService } from './collect-source-category.service';

/** 源站分类 → 本站分类的映射表，采集写库前按它决定影片归属。 */
@Module({
  controllers: [CollectSourceCategoryController],
  providers: [CollectSourceCategoryService],
  exports: [CollectSourceCategoryService],
})
export class CollectSourceCategoryModule {}
