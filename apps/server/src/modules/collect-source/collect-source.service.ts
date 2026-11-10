import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectSource } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { autoMatchCategory } from '@lcm/shared';
import { fetchClassList } from '../../jobs/collect/classes';
import type { SourceRuntime } from '../../jobs/collect/types';
import type {
  CollectSourceAllDTO,
  CollectSourceBatchDTO,
  CollectSourceCreateDTO,
  CollectSourceDeleteDTO,
  CollectSourceGetDTO,
  CollectSourcePageDTO,
  CollectSourceRunDTO,
  CollectSourceUpdateDTO,
  CollectSourceVO,
} from './dto/collect-source';

const ALL_LIMIT = 1000;

@Injectable()
export class CollectSourceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CollectSourceCreateDTO): Promise<CollectSourceVO> {
    const row = await this.prisma.collectSource.create({ data: { ...dto } });
    return toVO(row);
  }

  async update(dto: CollectSourceUpdateDTO): Promise<CollectSourceVO> {
    const current = await this.prisma.collectSource.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('采集源不存在');

    const { id: _id, ...patch } = dto;
    const filled = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (Object.keys(filled).length === 0) throw new BadRequestException('没有要修改的内容');

    const row = await this.prisma.collectSource.update({ where: { id: dto.id }, data: filled });
    return toVO(row);
  }

  /**
   * 删除采集源：连带清理它的线路、分类映射、替换规则、任务、采集记录与广告特征。
   * 返回删掉的线路数，以及删除后变成「没有播放线路」的影片数。
   */
  async delete(dto: CollectSourceDeleteDTO): Promise<{ deleted: number; lines: number; emptyVods: number }> {
    const existing = await this.prisma.collectSource.count({ where: { id: { in: dto.ids } } });
    if (existing === 0) return { deleted: 0, lines: 0, emptyVods: 0 };

    const emptyVods = await this.countWillBeEmpty(dto.ids);

    const result = await this.prisma.$transaction(async (tx) => {
      const lines = await tx.vodPlay.deleteMany({ where: { sourceId: { in: dto.ids } } });
      const logIds = (
        await tx.collectTaskLog.findMany({ where: { sourceId: { in: dto.ids } }, select: { id: true } })
      ).map((row) => row.id);
      if (logIds.length > 0) {
        await tx.collectTaskLogDetail.deleteMany({ where: { logId: { in: logIds } } });
        await tx.collectTaskLog.deleteMany({ where: { id: { in: logIds } } });
      }
      await tx.collectSourceCategory.deleteMany({ where: { sourceId: { in: dto.ids } } });
      await tx.sourceRule.deleteMany({ where: { sourceId: { in: dto.ids } } });
      await tx.collectTask.deleteMany({ where: { sourceId: { in: dto.ids } } });
      await tx.adFeature.deleteMany({ where: { sourceId: { in: dto.ids } } });
      const removed = await tx.collectSource.deleteMany({ where: { id: { in: dto.ids } } });
      return { deleted: removed.count, lines: lines.count };
    });

    return { ...result, emptyVods };
  }

  async get(dto: CollectSourceGetDTO): Promise<CollectSourceVO> {
    const rows = await this.prisma.collectSource.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('采集源不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return toVO(rows[0]!);
  }

  async page(dto: CollectSourcePageDTO): Promise<Page<CollectSourceVO>> {
    const where = this.buildWhere(dto);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.collectSource.count({ where }),
      this.prisma.collectSource.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    return toPage(rows.map(toVO), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: CollectSourceAllDTO): Promise<CollectSourceVO[]> {
    const rows = await this.prisma.collectSource.findMany({
      where: this.buildWhere(dto),
      orderBy: [{ id: 'asc' }],
      take: ALL_LIMIT,
    });
    return rows.map(toVO);
  }

  async batch(dto: CollectSourceBatchDTO): Promise<{ affected: number }> {
    const result = await this.prisma.collectSource.updateMany({
      where: { id: { in: dto.ids } },
      data: { isEnabled: dto.action === 'enable' ? 1 : 0 },
    });
    return { affected: result.count };
  }

  /**
   * 线路标识 → 采集源名：来源是 lcm_collect_source.play_from（逗号列表），
   * 同一标识只取第一个登记的源。线路表展示 sourceName 用。
   */
  async playFromNameMap(): Promise<Map<string, string>> {
    const rows = await this.prisma.collectSource.findMany({ select: { name: true, playFrom: true } });
    const map = new Map<string, string>();
    for (const row of rows) {
      for (const part of row.playFrom.split(',')) {
        const key = part.trim();
        if (key.length > 0 && !map.has(key)) map.set(key, row.name);
      }
    }
    return map;
  }

  /** 采集源 id → 名称，给线路表等处展示用（决策 2.1：跨模块只走 Service）。 */
  async nameMap(ids: Array<number | null>): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id): id is number => id !== null))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.collectSource.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /**
   * 删掉这些采集源的线路后，会变成「一条线路都没有」的影片数。
   * 一条 SQL 直接算，避免把十几万 vod_id 拉到内存里。
   */
  private async countWillBeEmpty(sourceIds: number[]): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*) AS total FROM (
          SELECT DISTINCT vod_id FROM lcm_vod_play WHERE source_id IN (${Prisma.join(sourceIds)})
        ) affected
        WHERE NOT EXISTS (
          SELECT 1 FROM lcm_vod_play p
          WHERE p.vod_id = affected.vod_id
            AND (p.source_id IS NULL OR p.source_id NOT IN (${Prisma.join(sourceIds)}))
        )
      `,
    );
    return Number(rows[0]?.total ?? 0);
  }

  private buildWhere(input: {
    id?: number;
    name?: string;
    apiUrl?: string;
    isEnabled?: number;
    keyword?: string;
  }): Prisma.CollectSourceWhereInput {
    const where: Prisma.CollectSourceWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.name !== undefined) where.name = input.name;
    if (input.apiUrl !== undefined) where.apiUrl = input.apiUrl;
    if (input.isEnabled !== undefined) where.isEnabled = input.isEnabled;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.name = { contains: input.keyword };
    }
    return where;
  }
  /**
   * 测试连通性：只拉一次源站分类列表，不落库。
   * 失败也回 code=0（这是"探测结果"，不是接口失败），前端按 ok 字段展示。
   */
  async test(dto: CollectSourceRunDTO) {
    const source = await this.loadRuntime(dto.id);
    const startedAt = Date.now();
    try {
      const { classes, via } = await fetchClassList(source);
      return {
        ok: true,
        elapsedMs: Date.now() - startedAt,
        categories: classes.length,
        via,
        sample: classes.slice(0, 5).map((item) => item.typeName),
      };
    } catch (error) {
      return {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 拉取源站分类并写入映射表：已存在的更新名称与父级，
   * 未映射的记录顺手自动匹配一次（与"自动匹配"按钮同一套规则）。
   */
  async fetchCategories(dto: CollectSourceRunDTO) {
    const source = await this.loadRuntime(dto.id);

    let classes;
    try {
      classes = (await fetchClassList(source)).classes;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.collectSource.update({
        where: { id: dto.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: 2, lastSyncMsg: message.slice(0, 255) },
      });
      throw new BadRequestException(`获取分类失败：${message}`);
    }

    if (classes.length === 0) {
      throw new BadRequestException('接口没有返回分类数据（需要 ac=list 且响应带 class）');
    }

    for (const item of classes) {
      await this.prisma.collectSourceCategory.upsert({
        where: { sourceId_sourceTypeId: { sourceId: dto.id, sourceTypeId: item.typeId } },
        create: {
          sourceId: dto.id,
          sourceTypeId: item.typeId,
          sourceTypeName: item.typeName,
          sourceTypePid: item.typePid,
        },
        update: { sourceTypeName: item.typeName, sourceTypePid: item.typePid },
      });
    }

    // 未映射的记录自动匹配：只补 categoryId=0 且未忽略的
    const [pending, categories] = await Promise.all([
      this.prisma.collectSourceCategory.findMany({
        where: { sourceId: dto.id, status: 0, categoryId: 0 },
        select: { id: true, sourceTypeName: true },
      }),
      this.prisma.category.findMany({
        orderBy: [{ pid: 'asc' }, { sort: 'asc' }],
        select: { id: true, pid: true, name: true, matchNames: true },
      }),
    ]);
    const matchInfo = categories.map((row) => ({
      id: row.id,
      pid: row.pid,
      name: row.name,
      matchNames: row.matchNames.split(',').map((item) => item.trim()).filter(Boolean),
    }));

    let matched = 0;
    for (const row of pending) {
      const categoryId = autoMatchCategory(row.sourceTypeName, matchInfo);
      if (categoryId <= 0) continue;
      await this.prisma.collectSourceCategory.update({
        where: { id: row.id },
        data: { categoryId, status: 1, matchType: 1 },
      });
      matched += 1;
    }

    await this.prisma.collectSource.update({
      where: { id: dto.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: 1, lastSyncMsg: `共 ${classes.length} 个分类` },
    });

    const total = await this.prisma.collectSourceCategory.count({ where: { sourceId: dto.id } });
    return { total, synced: classes.length, matched, unmapped: pending.length - matched };
  }

  /** 组装引擎需要的运行期配置（只有分类同步与连通性测试会用到） */
  private async loadRuntime(id: number): Promise<SourceRuntime> {
    const row = await this.prisma.collectSource.findUnique({ where: { id } });
    if (row === null) throw new NotFoundException('采集源不存在');
    return {
      id: row.id,
      name: row.name,
      apiUrl: row.apiUrl,
      apiParams: row.apiParams,
      intervalSec: row.intervalSec,
      timeout: row.timeout,
      retryTimes: row.retryTimes,
      pagesize: row.pagesize,
    };
  }
}

function toVO(row: CollectSource): CollectSourceVO {
  return {
    id: row.id,
    name: row.name,
    apiUrl: row.apiUrl,
    apiParams: row.apiParams,
    parseUrl: row.parseUrl,
    isEnabled: row.isEnabled,
    intervalSec: row.intervalSec,
    pagesize: row.pagesize,
    timeout: row.timeout,
    retryTimes: row.retryTimes,
    lastSyncAt: row.lastSyncAt === null ? null : row.lastSyncAt.toISOString(),
    lastSyncStatus: row.lastSyncStatus,
    lastSyncMsg: row.lastSyncMsg,
    playFrom: row.playFrom,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  }
