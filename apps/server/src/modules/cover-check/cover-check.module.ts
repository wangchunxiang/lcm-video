import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverCheckEntity } from './cover-check.entity';
import { CoverCheckController } from './cover-check.controller';
import { CoverCheckService } from './cover-check.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoverCheckEntity])],
  controllers: [CoverCheckController],
  providers: [CoverCheckService],
  exports: [CoverCheckService],
})
export class CoverCheckModule {}
