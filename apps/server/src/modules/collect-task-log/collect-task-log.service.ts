import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectTaskLog } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import { CollectTaskLogDetailService } from '../collect-task-log-detail/collect-task-log-detail.service';
import type {
  CollectTaskLogAllDTO,
  CollectTaskLogCreateDTO,
  CollectTaskLogDeleteDTO,
  CollectTaskLogGetDTO,
  CollectTaskLogPageDTO,
  CollectTaskLogUpdateDTO,
  CollectTaskLogVO,
} from './dto/collect-task-log';

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

@Injectable()
export class CollectTaskLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: CollectSourceService,
    private readonly details: CollectTaskLogDetailService,
  ) {}

  async create(dto: CollectTaskLogCreateDTO): Promise<CollectTaskLogVO> {
    const source = await this.prisma.collectSource.findUnique({
      where: { id: dto.sourceId },
      select: { id: true, name: true },
    });
    if (!source) throw new BadRequestException('采集源不存在');

    // 任务名快照：任务删除后记录仍要显示是谁跑的
    let taskName = dto.taskName;
    if (dto.taskId > 0) {
      const task = await this.prisma.collectTask.findUnique({
        where: { id: dto.taskId },
        select: { name: true, sourceId: true, rangeType: true },
      });
      if (!task) throw new BadRequestException('任务不存在');
      taskName = taskName || task.name;
    }
    if (!taskName) taskName = `手动采集·${source.name}`;

    const row = await this.prisma.collectTaskLog.create({ data: { ...dto, taskName } });
    return (await this.toVOList([row]))[0]!;
  }

  async update(dto: CollectTaskLogUpdateDTO): Promise<CollectTaskLogVO> {
    const current = await this.prisma.collectTaskLog.findUnique({ where: { id: dto.id } });
    if (!current) throw new NotFoundException('采集记录不存在');

    const { id, finishedAt, ...rest } = dto;
    const patch: Prisma.CollectTaskLogUpdateInput = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    if (finishedAt !== undefined) patch.finishedAt = finishedAt;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    const row = await this.prisma.collectTaskLog.update({ where: { id }, data: patch });
    return (await this.toVOList([row]))[0]!;
  }

  /** 删记录连带删明细；运行中的记录不许删 */
  async delete(dto: CollectTaskLogDeleteDTO): Promise<{ deleted: number }> {
    const running = await this.prisma.collectTaskLog.findMany({
      where: { id: { in: dto.ids }, status: 1 },
      select: { id: true },
    });
    if (running.length > 0) throw new BadRequestException('运行中的记录不能删除，请先停止采集');

    const [, result] = await this.prisma.$transaction([
      this.prisma.collectTaskLogDetail.deleteMany({ where: { logId: { in: dto.ids } } }),
      this.prisma.collectTaskLog.deleteMany({ where: { id: { in: dto.ids } } }),
    ]);
    return { deleted: result.count };
  }

  async get(dto: CollectTaskLogGetDTO): Promise<{
    log: CollectTaskLogVO;
    details: Page<unknown>;
  }> {
    const where: Prisma.CollectTaskLogWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.taskId !== undefined) where.taskId = dto.taskId;
    if (dto.sourceId) where.sourceId = dto.sourceId;

    const rows = await this.prisma.collectTaskLog.findMany({ where, take: 2 });
    if (rows.length === 0) throw new NotFoundException('采集记录不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');

    const log = (await this.toVOList([rows[0]!]))[0]!;
    const details = await this.details.page({
      logId: log.id,
      pageNum: dto.pageNum,
      pageSize: dto.pageSize,
    });
    return { log, details };
  }

  async page(dto: CollectTaskLogPageDTO): Promise<Page<CollectTaskLogVO>> {
    const where: Prisma.CollectTaskLogWhereInput = {};
    if (dto.taskId !== undefined) where.taskId = dto.taskId;
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.status !== undefined) where.status = dto.status;
    if (dto.keyword) where.taskName = { contains: dto.keyword };

    const [rows, total] = await Promise.all([
      this.prisma.collectTaskLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.collectTaskLog.count({ where }),
    ]);

    return toPage(await this.toVOList(rows), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: CollectTaskLogAllDTO): Promise<CollectTaskLogVO[]> {
    const where: Prisma.CollectTaskLogWhereInput = {};
    if (dto.taskId !== undefined) where.taskId = dto.taskId;
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.status !== undefined) where.status = dto.status;

    const rows = await this.prisma.collectTaskLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ALL_LIMIT,
    });
    return this.toVOList(rows);
  }

  /**
   * last_page 是断点续采锚点；功能上线前的老记录没有它，
   * 用明细里的最大页码兜底，否则续采会从第 1 页重来。
   */
  private async lastPageMap(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ id: number; lastPage: bigint | number }>>`
      SELECT l.id AS id,
             GREATEST(
               l.last_page,
               COALESCE((SELECT MAX(d.page) FROM lcm_collect_task_log_detail d WHERE d.log_id = l.id), 0)
             ) AS lastPage
      FROM lcm_collect_task_log l
      WHERE l.id IN (${Prisma.join(ids)})
    `;
    return new Map(rows.map((row) => [Number(row.id), Number(row.lastPage ?? 0)]));
  }

  private async toVOList(rows: CollectTaskLog[]): Promise<CollectTaskLogVO[]> {
    if (rows.length === 0) return [];

    const [sourceNames, lastPages] = await Promise.all([
      this.sources.nameMap(rows.map((row) => row.sourceId)),
      this.lastPageMap(rows.map((row) => row.id)),
    ]);

    return rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      taskName: row.taskName,
      sourceId: row.sourceId,
      sourceName: sourceNames.get(row.sourceId) ?? '',
      rangeType: row.rangeType,
      status: row.status,
      manual: row.taskId === 0,
      totalPages: row.totalPages,
      lastPage: lastPages.get(row.id) ?? row.lastPage,
      resumeCount: row.resumeCount,
      interruptedMs: row.interruptedMs,
      total: row.total,
      inserted: row.inserted,
      updated: row.updated,
      skipped: row.skipped,
      ignored: row.ignored,
      failed: row.failed,
      message: row.message,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
