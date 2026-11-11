import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** 探活：不拥有表，只读数据库与进程状态，所以放在 modules/ 下但不需要 forFeature。 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
