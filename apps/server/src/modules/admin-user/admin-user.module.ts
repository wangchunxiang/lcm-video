import { Module } from '@nestjs/common';
import { AdminUserController, AuthController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';
import { SettingModule } from '../setting/setting.module';

/** 账号表：controller 里的登录接口依赖 SettingService 读 login_expire_days。 */
@Module({
  imports: [SettingModule],
  controllers: [AdminUserController, AuthController],
  providers: [AdminUserService],
  exports: [AdminUserService],
})
export class AdminUserModule {}
