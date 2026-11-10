import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CollectTaskLogDetail, Prisma } from '@prisma/client';
import type { Page } from '../../common/pagination/page';
import { toPage } from '../../common/pagination/page';
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

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

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
export class CollectTaskLogDetailService {
  constructor(private readonly prisma: PrismaService) {}

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
    const current = await this.prisma.collectTaskLogDetail.findUnique({ where: { id: dto.id } });
    if (!current) throw new NotFoundException('明细不存在');

    const { id, failDetail, ...rest } = dto;
    const patch: Prisma.CollectTaskLogDetailUpdateInput = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    if (failDetail !== undefined) patch.failDetail = failDetail ?? undefined;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    return toVO(await this.prisma.collectTaskLogDetail.update({ where: { id }, data: patch }));
  }

  async delete(dto: CollectTaskLogDetailDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.collectTaskLogDetail.deleteMany({
      where: { id: { in: dto.ids } },
    });
    return { deleted: result.count };
  }

  async get(dto: CollectTaskLogDetailGetDTO): Promise<CollectTaskLogDetailVO> {
    const where: Prisma.CollectTaskLogDetailWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.logId) where.logId = dto.logId;
    if (dto.page !== undefined) where.page = dto.page;

    const rows = await this.prisma.collectTaskLogDetail.findMany({ where, take: 2 });
    if (rows.length === 0) throw new NotFoundException('明细不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return toVO(rows[0]!);
  }

  async page(dto: CollectTaskLogDetailPageDTO): Promise<Page<CollectTaskLogDetailVO>> {
    const where: Prisma.CollectTaskLogDetailWhereInput = { logId: dto.logId };
    const [rows, total] = await Promise.all([
      this.prisma.collectTaskLogDetail.findMany({
        where,
        orderBy: [{ page: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.collectTaskLogDetail.count({ where }),
    ]);
    return toPage(rows.map(toVO), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: CollectTaskLogDetailAllDTO): Promise<CollectTaskLogDetailVO[]> {
    const rows = await this.prisma.collectTaskLogDetail.findMany({
      where: { logId: dto.logId },
      orderBy: [{ page: 'asc' }, { id: 'asc' }],
      take: ALL_LIMIT,
    });
    return rows.map(toVO);
  }
}
