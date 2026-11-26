import { Controller, Get, Query } from '@nestjs/common';
import { ADMIN_API_PREFIX } from '../../common/http/api-prefix';
import { DashboardService } from './dashboard.service';
import { CollectSeriesDTO } from './dto/collect-series.dto';
import type { CollectSeries, DashboardSummary } from './dashboard.service';

/** 后台首页概览。 */
@Controller(`${ADMIN_API_PREFIX}/dashboard`)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.dashboardService.summary();
  }

  /**
   * 「采集量」曲线的数据。单独一个接口，不塞进 `summary`：切范围只刷这一张卡，
   * 其余七块（KPI、饼图、线路分布、两张列表）不必跟着重算，也不会出现
   * 「今日入库 312」旁边画着本月柱子这种读不通的界面。
   */
  @Get('collect-series')
  collectSeries(@Query() query: CollectSeriesDTO): Promise<CollectSeries> {
    return this.dashboardService.collectSeries(query.range ?? 'day');
  }
}
