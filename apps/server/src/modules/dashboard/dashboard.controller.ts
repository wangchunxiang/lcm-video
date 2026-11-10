import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import type { DashboardSummary } from './dashboard.service';

/** 后台首页概览。 */
@Controller('api/admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.dashboardService.summary();
  }
}
