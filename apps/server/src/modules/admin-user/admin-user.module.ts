import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingModule } from '../setting/setting.module';
import { AdminUserEntity } from './admin-user.entity';
import { AdminUserController } from './admin-user.controller';
import { AuthController } from './auth.controller';
import { AdminUserService } from './admin-user.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUserEntity]), SettingModule],
  controllers: [AdminUserController, AuthController],
  providers: [AdminUserService],
  exports: [AdminUserService],
})
export class AdminUserModule {}
