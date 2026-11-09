import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from './public.decorator';

/** 探活：连库查一次，确认进程与数据库都可用。 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('healthz')
  async health(): Promise<{ db: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { db: 'up' };
  }
}
