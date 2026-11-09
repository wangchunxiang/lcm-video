import { Module } from '@nestjs/common';
import { CoverCheckController } from './cover-check.controller';
import { CoverCheckService } from './cover-check.service';

@Module({
  controllers: [CoverCheckController],
  providers: [CoverCheckService],
  exports: [CoverCheckService],
})
export class CoverCheckModule {}
