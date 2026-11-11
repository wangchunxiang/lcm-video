import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectModule } from '../collect/collect.module';
import { CollectSourceEntity } from './collect-source.entity';
import { CollectSourceController } from './collect-source.controller';
import { CollectSourceService } from './collect-source.service';

@Module({
  imports: [TypeOrmModule.forFeature([CollectSourceEntity]), CollectModule],
  controllers: [CollectSourceController],
  providers: [CollectSourceService],
  exports: [CollectSourceService],
})
export class CollectSourceModule {}
