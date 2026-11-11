import { Body, Post } from '@nestjs/common';
import { AppCrud } from '../../common/crud/app-crud.decorator';
import { CoverCheckEntity } from './cover-check.entity';
import { CoverCheckService } from './cover-check.service';
import type { CoverHostSummary } from './cover-check.service';
import type { RepairItem, ScanResult } from './repair';
import {
  CreateCoverCheckDTO,
  HostDTO,
  HostVodsDTO,
  RepairDTO,
  UpdateCoverCheckDTO,
} from './dto/cover-check.dto';

/** 封面体检：标准 REST + 域名概览 / 扫描 / 清空 / 修复。 */
@AppCrud({
  entity: CoverCheckEntity,
  path: 'api/admin/cover-check',
  dto: { create: CreateCoverCheckDTO, update: UpdateCoverCheckDTO },
})
export class CoverCheckController {
  constructor(public readonly service: CoverCheckService) {}

  /** 域名列表与汇总（影片数实时统计）。 */
  @Post('hosts')
  hosts(): Promise<CoverHostSummary> {
    return this.service.hosts();
  }

  /** 某个域名下的影片分页。 */
  @Post('host-vods')
  hostVods(
    @Body() dto: HostVodsDTO,
  ): Promise<{ items: Array<{ id: string; name: string; cover: string }>; total: number }> {
    return this.service.hostVods(
      this.service.requireHost(dto.host),
      dto.take ?? 20,
      dto.skip ?? 0,
    );
  }

  /** 抽查这个域名下的 2 张封面，写入体检结果。 */
  @Post('scan')
  scan(@Body() dto: HostDTO): Promise<ScanResult> {
    return this.service.scan(this.service.requireHost(dto.host));
  }

  /** 清空这个域名下的全部封面。 */
  @Post('clear')
  clear(@Body() dto: HostDTO): Promise<{ cleared: number }> {
    return this.service.clear(this.service.requireHost(dto.host));
  }

  /** 尝试给失效封面换可用地址。 */
  @Post('repair')
  repair(
    @Body() dto: RepairDTO,
  ): Promise<{
    fixed: number;
    failed: number;
    remaining: number;
    scanned: number;
    items: RepairItem[];
  }> {
    return this.service.repair(this.service.requireHost(dto.host), dto.limit ?? 50);
  }

  /** 清掉已经没有影片归属的域名记录。 */
  @Post('prune')
  prune(): Promise<{ deleted: number }> {
    return this.service.prune();
  }
}
