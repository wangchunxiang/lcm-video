import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdFeatureEntity } from './ad-feature.entity';
import { AdFeatureController } from './ad-feature.controller';
import { AdFeatureService } from './ad-feature.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdFeatureEntity])],
  controllers: [AdFeatureController],
  providers: [AdFeatureService],
  exports: [AdFeatureService],
})
export class AdFeatureModule {}
