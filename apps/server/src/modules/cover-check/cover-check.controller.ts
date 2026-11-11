import { Body, Post } from '@nestjs/common';
import { Crud, CrudActionsEnum } from '@ackplus/nest-crud';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CoverCheckEntity } from './cover-check.entity';
import { CoverCheckService } from './cover-check.service';
import type { CoverHostSummary } from './cover-check.service';
import type { RepairItem, ScanResult } from './repair';
import { CreateCoverCheckDTO, UpdateCoverCheckDTO } from './dto/cover-check.dto';

/** 域名入参。 */
class HostDTO {
  @IsString({ message: '域名必须是字符串' })
  @MinLength(1, { message: '域名不能为空' })
  @MaxLength(255, { message: '域名最长 255 个字符' })
  host!: string;
}

/** 修复入参：limit 控制一次处理多少部。 */
class RepairDTO extends HostDTO {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 最小 1' })
  @Max(500, { message: 'limit 最大 500' })
  limit?: number;
}

/** 域名下的影片分页入参。 */
class HostVodsDTO extends HostDTO {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'take 必须是整数' })
  @Min(1, { message: 'take 最小 1' })
  @Max(100, { message: 'take 最大 100' })
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'skip 必须是整数' })
  @Min(0, { message: 'skip 不能为负' })
  skip?: number;
}

/** 封面体检：标准 REST + 域名概览 / 扫描 / 清空 / 修复。 */
@Crud({
  entity: CoverCheckEntity,
  path: 'api/admin/cover-check',
  softDelete: false,
  maxPerPage: 100,
  dto: { create: CreateCoverCheckDTO, update: UpdateCoverCheckDTO },
  routes: {
    [CrudActionsEnum.CREATE_MANY]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH]: false,
    [CrudActionsEnum.DELETE_FROM_TRASH_MANY]: false,
    [CrudActionsEnum.RESTORE]: false,
    [CrudActionsEnum.RESTORE_MANY]: false,
    [CrudActionsEnum.REORDER]: false,
  },
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
