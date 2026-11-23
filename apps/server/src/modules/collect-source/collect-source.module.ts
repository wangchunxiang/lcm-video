import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectModule } from '../collect/collect.module';
import { CollectSourceCategoryModule } from '../collect-source-category/collect-source-category.module';
import { CollectSourceEntity } from './collect-source.entity';
import { CollectSourceController } from './collect-source.controller';
import { CollectSourceService } from './collect-source.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectSourceEntity]),
    CollectModule,
    CollectSourceCategoryModule,
  ],
  controllers: [CollectSourceController],
  providers: [CollectSourceService],
  exports: [CollectSourceService],
})
export class CollectSourceModule {}
