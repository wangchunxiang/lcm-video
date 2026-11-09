import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { nextRunAt } from '@lcm/shared';
import type { CollectTask, Prisma } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import type {
  CollectTaskAllDTO,
  CollectTaskBatchDTO,
  CollectTaskCreateDTO,
  CollectTaskDeleteDTO,
  CollectTaskGetDTO,
  CollectTaskPageDTO,
  CollectTaskUpdateDTO,
  CollectTaskVO,
} from './dto/collect-task';

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

@Injectable()
export class CollectTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: CollectSourceService,
  ) {}

  async create(dto: CollectTaskCreateDTO): Promise<CollectTaskVO> {
    await this.assertSource(dto.sourceId);
    const row = await this.prisma.collectTask.create({ data: dto });
    return (await this.toVOList([row]))[0]!;
  }

  async update(dto: CollectTaskUpdateDTO): Promise<CollectTaskVO> {
    const current = await this.prisma.collectTask.findUnique({ where: { id: dto.id } });
    if (!current) throw new NotFoundException('任务不存在');

    const { id, ...rest } = dto;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Prisma.CollectTaskUpdateInput;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');
    if (patch.sourceId !== undefined) await this.assertSource(Number(patch.sourceId));

    const row = await this.prisma.collectTask.update({ where: { id }, data: patch });
    return (await this.toVOList([row]))[0]!;
  }

  async delete(dto: CollectTaskDeleteDTO): Promise<{ deleted: number }> {
    await this.assertNotRunning(dto.ids);
    const result = await this.prisma.collectTask.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async batch(dto: CollectTaskBatchDTO): Promise<{ affected: number }> {
    if (dto.action === 'delete') {
      await this.assertNotRunning(dto.ids);
      const result = await this.prisma.collectTask.deleteMany({ where: { id: { in: dto.ids } } });
      return { affected: result.count };
    }

    const result = await this.prisma.collectTask.updateMany({
      where: { id: { in: dto.ids } },
      data: { isEnabled: dto.action === 'enable' ? 1 : 0 },
    });
    return { affected: result.count };
  }

  async get(dto: CollectTaskGetDTO): Promise<CollectTaskVO> {
    const rows = await this.prisma.collectTask.findMany({ where: this.getWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('任务不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return (await this.toVOList([rows[0]!]))[0]!;
  }

  async page(dto: CollectTaskPageDTO): Promise<Page<CollectTaskVO>> {
    const where: Prisma.CollectTaskWhereInput = {};
    if (dto.keyword) where.name = { contains: dto.keyword };
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.isEnabled !== undefined) where.isEnabled = dto.isEnabled;

    const [rows, total] = await Promise.all([
      this.prisma.collectTask.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.collectTask.count({ where }),
    ]);

    return toPage(await this.toVOList(rows), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: CollectTaskAllDTO): Promise<CollectTaskVO[]> {
    const where: Prisma.CollectTaskWhereInput = {};
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.isEnabled !== undefined) where.isEnabled = dto.isEnabled;

    const rows = await this.prisma.collectTask.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ALL_LIMIT,
    });
    return this.toVOList(rows);
  }

  private getWhere(dto: CollectTaskGetDTO): Prisma.CollectTaskWhereInput {
    const where: Prisma.CollectTaskWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.name) where.name = dto.name;
    if (dto.sourceId) where.sourceId = dto.sourceId;
    return where;
  }

  private async assertSource(sourceId: number): Promise<void> {
    const source = await this.prisma.collectSource.findUnique({ where: { id: sourceId }, select: { id: true } });
    if (!source) throw new BadRequestException('请选择有效的采集源');
  }

  /** 正在跑的任务不能删：先取消，否则记录会挂在已删除的任务上 */
  private async assertNotRunning(ids: number[]): Promise<void> {
    const running = await this.prisma.collectTaskLog.findMany({
      where: { taskId: { in: ids }, status: 1 },
      select: { taskId: true },
    });
    if (running.length === 0) return;

    const runningIds = [...new Set(running.map((row) => row.taskId))];
    const tasks = await this.prisma.collectTask.findMany({
      where: { id: { in: runningIds } },
      select: { name: true },
    });
    const names = tasks.map((row) => row.name).join('、');
    throw new BadRequestException(`${names} 正在执行，请先取消`);
  }

  /** 源名与运行状态都要批量查，避免列表 N+1 */
  private async toVOList(rows: CollectTask[]): Promise<CollectTaskVO[]> {
    if (rows.length === 0) return [];

    const sourceNames = await this.sources.nameMap(rows.map((row) => row.sourceId));
    const running = await this.prisma.collectTaskLog.findMany({
      where: { taskId: { in: rows.map((row) => row.id) }, status: 1 },
      select: { id: true, taskId: true },
    });
    const runningMap = new Map(running.map((row) => [row.taskId, row.id]));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sourceId: row.sourceId,
      sourceName: sourceNames.get(row.sourceId) ?? '',
      rangeType: row.rangeType,
      cron: row.cron,
      isEnabled: row.isEnabled,
      lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
      lastRunStatus: row.lastRunStatus,
      lastRunMsg: row.lastRunMsg,
      runningLogId: runningMap.get(row.id) ?? null,
      nextRunAt:
        row.cron && row.isEnabled === 1 ? (nextRunAt(row.cron)?.toISOString() ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
