import { Controller, Get } from '@nestjs/common';
import { ADMIN_API_PREFIX } from '../../common/http/api-prefix';
import { DashboardService } from './dashboard.service';
import type { DashboardSummary } from './dashboard.service';

/** 后台首页概览。 */
@Controller(`${ADMIN_API_PREFIX}/dashboard`)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.dashboardService.summary();
  }
}
