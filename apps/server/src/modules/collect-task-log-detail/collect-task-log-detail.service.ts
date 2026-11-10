import { BadRequestException, Injectable } from '@nestjs/common';
import type { CollectTaskLogDetail, Prisma } from '@prisma/client';
import type { CrudDelegate } from '../../common/crud/crud.service';
import { CrudService, patchOf } from '../../common/crud/crud.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CollectTaskLogDetailAllDTO,
  CollectTaskLogDetailCreateDTO,
  CollectTaskLogDetailDeleteDTO,
  CollectTaskLogDetailGetDTO,
  CollectTaskLogDetailPageDTO,
  CollectTaskLogDetailUpdateDTO,
  CollectTaskLogDetailVO,
} from './dto/collect-task-log-detail';

function toVO(row: CollectTaskLogDetail): CollectTaskLogDetailVO {
  return {
    id: row.id,
    logId: row.logId,
    page: row.page,
    total: row.total,
    inserted: row.inserted,
    updated: row.updated,
    skipped: row.skipped,
    ignored: row.ignored,
    failed: row.failed,
    failDetail: row.failDetail,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CollectTaskLogDetailService extends CrudService<
  CollectTaskLogDetail,
  CollectTaskLogDetailVO,
  CollectTaskLogDetailGetDTO,
  CollectTaskLogDetailPageDTO,
  CollectTaskLogDetailAllDTO,
  CollectTaskLogDetailDeleteDTO
> {
  protected readonly label = '明细';

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** 用 getter 而不是字段初始化：字段初始化早于构造函数体，那时 this.prisma 还不存在 */
  protected get delegate(): CrudDelegate<CollectTaskLogDetail> {
    return this.prisma.collectTaskLogDetail as unknown as CrudDelegate<CollectTaskLogDetail>;
  }

  protected toVO(row: CollectTaskLogDetail): CollectTaskLogDetailVO {
    return toVO(row);
  }

  protected getWhere(dto: CollectTaskLogDetailGetDTO): Prisma.CollectTaskLogDetailWhereInput {
    const where: Prisma.CollectTaskLogDetailWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.logId) where.logId = dto.logId;
    if (dto.page !== undefined) where.page = dto.page;
    return where;
  }

  protected pageWhere(dto: CollectTaskLogDetailPageDTO): Prisma.CollectTaskLogDetailWhereInput {
    return { logId: dto.logId };
  }

  protected allWhere(dto: CollectTaskLogDetailAllDTO): Prisma.CollectTaskLogDetailWhereInput {
    return { logId: dto.logId };
  }

  protected pageOrder(): Prisma.CollectTaskLogDetailOrderByWithRelationInput[] {
    return [{ page: 'desc' }, { id: 'desc' }];
  }

  protected allOrder(): Prisma.CollectTaskLogDetailOrderByWithRelationInput[] {
    return [{ page: 'asc' }, { id: 'asc' }];
  }

  async create(dto: CollectTaskLogDetailCreateDTO): Promise<CollectTaskLogDetailVO> {
    const log = await this.prisma.collectTaskLog.findUnique({
      where: { id: dto.logId },
      select: { id: true },
    });
    if (!log) throw new BadRequestException('采集记录不存在');

    const { failDetail, ...rest } = dto;
    const row = await this.prisma.collectTaskLogDetail.create({
      data: { ...rest, failDetail: failDetail ?? undefined },
    });
    return toVO(row);
  }

  async update(dto: CollectTaskLogDetailUpdateDTO): Promise<CollectTaskLogDetailVO> {
    await this.requireRow(dto.id);

    const { id, failDetail, ...rest } = dto;
    void id;
    const patch = this.requirePatch(patchOf(rest as Record<string, unknown>));
    if (failDetail !== undefined) patch.failDetail = failDetail ?? undefined;

    const row = await this.prisma.collectTaskLogDetail.update({
      where: { id: dto.id },
      data: patch as Prisma.CollectTaskLogDetailUpdateInput,
    });
    return toVO(row);
  }
}
