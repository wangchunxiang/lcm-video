import { Controller, Post } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * 数据概览不是一张表，所以不走六件套：只有一个 `/summary`。
 * 方法统一 POST，与其余接口保持一致（决策 2.3）。
 */
@Controller('api/admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Post('summary')
  summary() {
    return this.dashboard.summary();
  }
}
