import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { autoMatchCategory } from '@lcm/shared';
import { Prisma } from '@prisma/client';
import type { CollectSourceCategory } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CollectSourceCategoryAllDTO,
  CollectSourceCategoryBySourceDTO,
  CollectSourceCategoryCreateDTO,
  CollectSourceCategoryDeleteDTO,
  CollectSourceCategoryGetDTO,
  CollectSourceCategoryMapDTO,
  CollectSourceCategoryMatchDTO,
  CollectSourceCategoryPageDTO,
  CollectSourceCategoryRemapDTO,
  CollectSourceCategorySummaryVO,
  CollectSourceCategoryUpdateDTO,
  CollectSourceCategoryVO,
} from './dto/collect-source-category';

const ALL_LIMIT = 1000;
const STATUS_MAPPED = 1;
const STATUS_IGNORED = 2;
const MATCH_AUTO = 1;
const MATCH_MANUAL = 2;

@Injectable()
export class CollectSourceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CollectSourceCategoryCreateDTO): Promise<CollectSourceCategoryVO> {
    await this.requireSource(dto.sourceId);
    const dup = await this.prisma.collectSourceCategory.count({
      where: { sourceId: dto.sourceId, sourceTypeId: dto.sourceTypeId },
    });
    if (dup > 0) throw new BadRequestException('该采集源下已有这个源站分类');

    const row = await this.prisma.collectSourceCategory.create({ data: { ...dto } });
    return this.toVO(row, await this.categoryMap([row.categoryId]));
  }

  async update(dto: CollectSourceCategoryUpdateDTO): Promise<CollectSourceCategoryVO> {
    const current = await this.prisma.collectSourceCategory.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('映射记录不存在');

    const { id: _id, ...patch } = dto;
    const filled = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (Object.keys(filled).length === 0) throw new BadRequestException('没有要修改的内容');

    // 只改状态时，按状态规则同步归类方式与目标分类
    if (filled.status !== undefined && filled.categoryId === undefined) {
      await this.applyMapping([dto.id], { status: filled.status as number });
      const row = await this.prisma.collectSourceCategory.findUnique({ where: { id: dto.id } });
      return this.toVO(row!, await this.categoryMap([row!.categoryId]));
    }

    const row = await this.prisma.collectSourceCategory.update({ where: { id: dto.id }, data: filled });
    return this.toVO(row, await this.categoryMap([row.categoryId]));
  }

  async delete(dto: CollectSourceCategoryDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.collectSourceCategory.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: CollectSourceCategoryGetDTO): Promise<CollectSourceCategoryVO> {
    const rows = await this.prisma.collectSourceCategory.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('映射记录不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return this.toVO(rows[0]!, await this.categoryMap([rows[0]!.categoryId]));
  }

  async page(dto: CollectSourceCategoryPageDTO): Promise<Page<CollectSourceCategoryVO>> {
    const where = this.buildWhere(dto);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.collectSourceCategory.count({ where }),
      this.prisma.collectSourceCategory.findMany({
        where,
        orderBy: [{ sourceTypePid: 'asc' }, { id: 'asc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    const categories = await this.categoryMap(rows.map((row) => row.categoryId));
    return toPage(
      rows.map((row) => this.toVO(row, categories)),
      total,
      dto.pageNum,
      dto.pageSize,
    );
  }

  async all(dto: CollectSourceCategoryAllDTO): Promise<CollectSourceCategoryVO[]> {
    const rows = await this.prisma.collectSourceCategory.findMany({
      where: this.buildWhere(dto),
      orderBy: [{ sourceTypePid: 'asc' }, { id: 'asc' }],
      take: ALL_LIMIT,
    });
    const categories = await this.categoryMap(rows.map((row) => row.categoryId));
    return rows.map((row) => this.toVO(row, categories));
  }

  /** 某个采集源的全部分类映射 + 汇总，后台「分类映射」页一次拿全。 */
  async bySource(
    dto: CollectSourceCategoryBySourceDTO,
  ): Promise<{ items: CollectSourceCategoryVO[]; summary: CollectSourceCategorySummaryVO }> {
    await this.requireSource(dto.sourceId);
    const rows = await this.prisma.collectSourceCategory.findMany({
      where: { sourceId: dto.sourceId },
      orderBy: [{ sourceTypePid: 'asc' }, { id: 'asc' }],
    });
    const categories = await this.categoryMap(rows.map((row) => row.categoryId));
    const items = rows.map((row) => this.toVO(row, categories));
    return {
      items,
      summary: {
        total: items.length,
        mapped: items.filter((item) => item.status === STATUS_MAPPED).length,
        ignored: items.filter((item) => item.status === STATUS_IGNORED).length,
        unmapped: items.filter((item) => item.status === 0).length,
      },
    };
  }

  /** 批量手动映射 / 忽略 / 取消映射。 */
  async map(dto: CollectSourceCategoryMapDTO): Promise<{ affected: number }> {
    const existing = await this.prisma.collectSourceCategory.count({ where: { id: { in: dto.ids } } });
    if (existing === 0) throw new NotFoundException('映射记录不存在');
    await this.applyMapping(dto.ids, { categoryId: dto.categoryId, status: dto.status });
    return { affected: existing };
  }

  /** 对某个采集源尚未映射的分类跑一次自动匹配（别名优先，其次同名）。 */
  async autoMatch(dto: CollectSourceCategoryMatchDTO): Promise<{ scanned: number; matched: number }> {
    await this.requireSource(dto.sourceId);
    const pending = await this.prisma.collectSourceCategory.findMany({
      where: { sourceId: dto.sourceId, status: 0, categoryId: 0 },
      select: { id: true, sourceTypeName: true },
    });
    if (pending.length === 0) return { scanned: 0, matched: 0 };

    const categories = await this.loadCategories();
    let matched = 0;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const row of pending) {
      const categoryId = autoMatchCategory(row.sourceTypeName, categories);
      if (categoryId === 0) continue;
      ops.push(
        this.prisma.collectSourceCategory.update({
          where: { id: row.id },
          data: { categoryId, matchType: MATCH_AUTO, status: STATUS_MAPPED },
        }),
      );
      matched += 1;
    }
    if (ops.length > 0) await this.prisma.$transaction(ops);
    return { scanned: pending.length, matched };
  }

  /** 目标分类变更后，把原来落在某个分类下的影片批量改到新分类。 */
  async remapVods(dto: CollectSourceCategoryRemapDTO): Promise<{ affected: number; from: number; to: number }> {
    await this.requireSource(dto.sourceId);
    const mapping = await this.prisma.collectSourceCategory.findFirst({
      where: { id: dto.id, sourceId: dto.sourceId },
    });
    if (mapping === null) throw new NotFoundException('映射记录不存在');
    if (mapping.categoryId === 0) throw new BadRequestException('该映射尚未设置目标分类');

    const target = await this.prisma.category.findUnique({ where: { id: mapping.categoryId } });
    if (target === null) throw new BadRequestException('目标分类不存在');
    if (target.id === dto.fromCategoryId) return { affected: 0, from: dto.fromCategoryId, to: target.id };

    const result = await this.prisma.vod.updateMany({
      where: { categoryId: dto.fromCategoryId },
      data: { categoryId: target.id, categoryPid: target.pid },
    });
    return { affected: result.count, from: dto.fromCategoryId, to: target.id };
  }

  /**
   * 映射状态机（与库里的 ck_status_mapped 一致）：
   * status=2 忽略 → 清空分类、手动；status=0 且无分类 → 未映射；
   * 有分类 → 已映射 + 手动。
   */
  private async applyMapping(
    ids: number[],
    input: { categoryId?: number; status?: number },
  ): Promise<void> {
    const status = input.status ?? -1;
    const categoryId = input.categoryId ?? 0;

    if (status === STATUS_IGNORED) {
      await this.prisma.collectSourceCategory.updateMany({
        where: { id: { in: ids } },
        data: { categoryId: 0, status: STATUS_IGNORED, matchType: MATCH_MANUAL },
      });
      return;
    }

    if (categoryId <= 0) {
      if (status === 0 || status === -1) {
        await this.prisma.collectSourceCategory.updateMany({
          where: { id: { in: ids } },
          data: { categoryId: 0, status: 0, matchType: 0 },
        });
        return;
      }
      throw new BadRequestException('请选择本站分类');
    }

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (category === null) throw new BadRequestException('本站分类不存在');

    await this.prisma.collectSourceCategory.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: category.id, status: STATUS_MAPPED, matchType: MATCH_MANUAL },
    });
  }

  private async loadCategories() {
    const rows = await this.prisma.category.findMany({
      select: { id: true, pid: true, name: true, matchNames: true },
    });
    return rows.map((row) => ({
      id: row.id,
      pid: row.pid,
      name: row.name,
      matchNames: row.matchNames
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    }));
  }

  private async requireSource(sourceId: number): Promise<void> {
    const count = await this.prisma.collectSource.count({ where: { id: sourceId } });
    if (count === 0) throw new NotFoundException('采集源不存在');
  }

  private buildWhere(input: {
    id?: number;
    sourceId?: number;
    sourceTypeId?: string;
    categoryId?: number;
    status?: number;
    keyword?: string;
  }): Prisma.CollectSourceCategoryWhereInput {
    const where: Prisma.CollectSourceCategoryWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.sourceId !== undefined) where.sourceId = input.sourceId;
    if (input.sourceTypeId !== undefined && input.sourceTypeId.length > 0) where.sourceTypeId = input.sourceTypeId;
    if (input.categoryId !== undefined) where.categoryId = input.categoryId;
    if (input.status !== undefined) where.status = input.status;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.OR = [{ sourceTypeName: { contains: input.keyword } }, { sourceTypeId: { contains: input.keyword } }];
    }
    return where;
  }

  private async categoryMap(ids: number[]): Promise<Map<number, { name: string; pid: number }>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.category.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, pid: true },
    });
    return new Map(rows.map((row) => [row.id, { name: row.name, pid: row.pid }]));
  }

  private toVO(
    row: CollectSourceCategory,
    categories: Map<number, { name: string; pid: number }>,
  ): CollectSourceCategoryVO {
    const category = categories.get(row.categoryId);
    return {
      id: row.id,
      sourceId: row.sourceId,
      sourceTypeId: row.sourceTypeId,
      sourceTypeName: row.sourceTypeName,
      sourceTypePid: row.sourceTypePid,
      categoryId: row.categoryId,
      matchType: row.matchType,
      status: row.status,
      categoryName: category?.name ?? '',
      categoryPid: category?.pid ?? 0,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
