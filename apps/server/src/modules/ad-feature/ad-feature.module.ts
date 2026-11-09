import { Module } from '@nestjs/common';
import { CollectSourceModule } from '../collect-source/collect-source.module';
import { AdFeatureController } from './ad-feature.controller';
import { AdFeatureService } from './ad-feature.service';

@Module({
  imports: [CollectSourceModule],
  controllers: [AdFeatureController],
  providers: [AdFeatureService],
  exports: [AdFeatureService],
})
export class AdFeatureModule {}
