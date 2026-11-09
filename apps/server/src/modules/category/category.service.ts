import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Prisma } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CategoryAllDTO,
  CategoryCreateDTO,
  CategoryDeleteDTO,
  CategoryGetDTO,
  CategoryNodeVO,
  CategoryPageDTO,
  CategoryUpdateDTO,
  CategoryVO,
} from './dto/category';

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

/** 实体 → 输出结构。日期统一 ISO 8601 字符串（决策 8.2）。 */
function toVO(row: Category): CategoryVO {
  return {
    id: row.id,
    pid: row.pid,
    name: row.name,
    alias: row.alias,
    matchNames: row.matchNames,
    sort: row.sort,
    isShow: row.isShow,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CategoryCreateDTO): Promise<CategoryVO> {
    await this.assertAliasFree(dto.alias, null);
    await this.assertParent(dto.pid, null);

    const row = await this.prisma.category.create({
      data: {
        pid: dto.pid,
        name: dto.name,
        alias: dto.alias,
        matchNames: dto.matchNames,
        sort: dto.sort,
        isShow: dto.isShow,
      },
    });
    return toVO(row);
  }

  async update(dto: CategoryUpdateDTO): Promise<CategoryVO> {
    const current = await this.prisma.category.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('分类不存在');

    if (dto.alias !== undefined) await this.assertAliasFree(dto.alias, dto.id);
    if (dto.pid !== undefined) await this.assertParent(dto.pid, dto.id);

    const row = await this.prisma.category.update({
      where: { id: dto.id },
      data: {
        pid: dto.pid,
        name: dto.name,
        alias: dto.alias,
        matchNames: dto.matchNames,
        sort: dto.sort,
        isShow: dto.isShow,
      },
    });
    return toVO(row);
  }

  /**
   * 批量删除。三条保护（与旧后台一致）：
   * 1. 有子分类不许删；2. 分类下还有影片不许删；
   * 3. 被源站分类映射引用时须显式 force，删除前把这些映射重置掉。
   */
  async delete(dto: CategoryDeleteDTO): Promise<{ deleted: number; resetMappings: number }> {
    const ids = dto.ids;

    const children = await this.prisma.category.count({ where: { pid: { in: ids } } });
    if (children > 0) throw new BadRequestException('请先删除该分类下的子分类');

    const usedByVod = await this.prisma.vod.count({ where: { categoryId: { in: ids } } });
    if (usedByVod > 0) throw new BadRequestException('该分类下还有影片，不能删除');

    const mappings = await this.prisma.collectSourceCategory.count({
      where: { categoryId: { in: ids }, status: 1 },
    });
    if (mappings > 0 && dto.force !== true) {
      throw new BadRequestException(`该分类被 ${mappings} 个源站分类映射，删除后这些映射会被重置`);
    }

    return this.prisma.$transaction(async (tx) => {
      let resetMappings = 0;
      if (mappings > 0) {
        const reset = await tx.collectSourceCategory.updateMany({
          where: { categoryId: { in: ids }, status: 1 },
          data: { categoryId: 0, status: 0, matchType: 0 },
        });
        resetMappings = reset.count;
      }
      const deleted = await tx.category.deleteMany({ where: { id: { in: ids } } });
      return { deleted: deleted.count, resetMappings };
    });
  }

  /** 单条查询：任意条件，命中 0 条或 ≥2 条都算调用方给错了条件。 */
  async get(dto: CategoryGetDTO): Promise<CategoryVO> {
    const rows = await this.prisma.category.findMany({
      where: this.buildWhere(dto),
      take: 2,
    });
    if (rows.length === 0) throw new NotFoundException('分类不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return toVO(rows[0] as Category);
  }

  async page(dto: CategoryPageDTO): Promise<Page<CategoryVO>> {
    const where = this.buildWhere({
      pid: dto.pid,
      isShow: dto.isShow,
      keyword: dto.keyword,
    });
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        orderBy: [{ pid: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    return toPage(rows.map(toVO), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: CategoryAllDTO): Promise<CategoryVO[]> {
    const rows = await this.prisma.category.findMany({
      where: this.buildWhere({ pid: dto.pid, isShow: dto.isShow }),
      orderBy: [{ pid: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      take: ALL_LIMIT,
    });
    return rows.map(toVO);
  }

  /** 额外接口：两级树 + 影片数，后台分类页与前台导航都用这一份。 */
  async tree(): Promise<CategoryNodeVO[]> {
    const [rows, counts] = await this.prisma.$transaction([
      this.prisma.category.findMany({ orderBy: [{ pid: 'asc' }, { sort: 'asc' }, { id: 'asc' }] }),
      // 每个分类的影片数。Prisma 的 groupBy 返回类型在 6.x 是联合类型，
      // 取 _count 需要断言；这里用裸 SQL（决策 3.4），类型由泛型给。
      this.prisma.$queryRaw<Array<{ categoryId: number; total: bigint }>>`
        SELECT category_id AS categoryId, COUNT(*) AS total
        FROM lcm_vod
        GROUP BY category_id
      `,
    ]);

    const countMap = new Map(counts.map((item) => [item.categoryId, Number(item.total)]));
    const parents = rows.filter((row) => row.pid === 0);
    const childrenOf = new Map<number, Category[]>();
    for (const row of rows) {
      if (row.pid === 0) continue;
      const list = childrenOf.get(row.pid) ?? [];
      list.push(row);
      childrenOf.set(row.pid, list);
    }

    return parents.map((parent) => {
      const children = (childrenOf.get(parent.id) ?? []).map((child) => ({
        ...toVO(child),
        vodCount: countMap.get(child.id) ?? 0,
        children: [] as CategoryNodeVO[],
      }));
      const own = countMap.get(parent.id) ?? 0;
      const total = children.reduce((sum, child) => sum + child.vodCount, own);
      return { ...toVO(parent), vodCount: total, children };
    });
  }

  private buildWhere(input: {
    id?: number;
    pid?: number;
    name?: string;
    alias?: string;
    isShow?: number;
    keyword?: string;
  }): Prisma.CategoryWhereInput {
    const where: Prisma.CategoryWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.pid !== undefined) where.pid = input.pid;
    if (input.name !== undefined) where.name = input.name;
    if (input.alias !== undefined) where.alias = input.alias;
    if (input.isShow !== undefined) where.isShow = input.isShow;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.OR = [{ name: { contains: input.keyword } }, { alias: { contains: input.keyword } }];
    }
    return where;
  }

  private async assertAliasFree(alias: string, selfId: number | null): Promise<void> {
    const rows = await this.prisma.category.findMany({
      where: selfId === null ? { alias } : { alias, id: { not: selfId } },
      select: { id: true },
      take: 1,
    });
    if (rows.length > 0) throw new BadRequestException('URL 别名已被占用');
  }

  /** 分类最多两级：父分类必须存在且本身是一级分类；有子分类的分类不能再挂到别人下面。 */
  private async assertParent(pid: number, selfId: number | null): Promise<void> {
    if (pid === 0) return;
    if (selfId !== null && pid === selfId) throw new BadRequestException('不能把自己设为父分类');

    const parent = await this.prisma.category.findUnique({ where: { id: pid } });
    if (parent === null) throw new BadRequestException('父分类不存在');
    if (parent.pid !== 0) throw new BadRequestException('分类最多两级，父分类必须是一级分类');

    if (selfId !== null) {
      const children = await this.prisma.category.count({ where: { pid: selfId } });
      if (children > 0) throw new BadRequestException('该分类下还有子分类，不能变成二级分类');
    }
  }
}
