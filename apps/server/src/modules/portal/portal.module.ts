import { Module } from '@nestjs/common';
import { SettingModule } from '../setting/setting.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [SettingModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
