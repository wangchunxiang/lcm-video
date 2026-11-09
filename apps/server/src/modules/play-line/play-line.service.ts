import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PlayLine, Prisma } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import type {
  PlayLineAllDTO,
  PlayLineBatchDTO,
  PlayLineCreateDTO,
  PlayLineDeleteDTO,
  PlayLineGetDTO,
  PlayLinePageDTO,
  PlayLineSortDTO,
  PlayLineUpdateDTO,
  PlayLineVO,
} from './dto/play-line';

const ALL_LIMIT = 1000;
const SORT_STEP = 10;

@Injectable()
export class PlayLineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collectSourceService: CollectSourceService,
  ) {}

  async create(dto: PlayLineCreateDTO): Promise<PlayLineVO> {
    const exists = await this.prisma.playLine.count({ where: { sourceFrom: dto.sourceFrom } });
    if (exists > 0) throw new BadRequestException(`线路标识 ${dto.sourceFrom} 已存在`);

    const row = await this.prisma.playLine.create({
      data: {
        sourceFrom: dto.sourceFrom,
        name: dto.name,
        sort: dto.sort,
        isEnabled: dto.isEnabled,
      },
    });
    return toVO(row, '');
  }

  async update(dto: PlayLineUpdateDTO): Promise<PlayLineVO> {
    const current = await this.prisma.playLine.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('线路不存在');

    const data: Prisma.PlayLineUpdateInput = {
      name: dto.name,
      sort: dto.sort,
      isEnabled: dto.isEnabled,
    };
    const row = await this.prisma.playLine.update({ where: { id: dto.id }, data });
    return toVO(row, (await this.collectSourceService.playFromNameMap()).get(row.sourceFrom) ?? '');
  }

  async delete(dto: PlayLineDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.playLine.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: PlayLineGetDTO): Promise<PlayLineVO> {
    const rows = await this.prisma.playLine.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('线路不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');

    const row = rows[0] as PlayLine;
    return toVO(row, (await this.collectSourceService.playFromNameMap()).get(row.sourceFrom) ?? '');
  }

  async page(dto: PlayLinePageDTO): Promise<Page<PlayLineVO>> {
    const where = this.buildWhere({ keyword: dto.keyword, isEnabled: dto.isEnabled });
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.playLine.count({ where }),
      this.prisma.playLine.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    const names = await this.collectSourceService.playFromNameMap();
    return toPage(
      rows.map((row) => toVO(row, names.get(row.sourceFrom) ?? '')),
      total,
      dto.pageNum,
      dto.pageSize,
    );
  }

  async all(dto: PlayLineAllDTO): Promise<PlayLineVO[]> {
    const rows = await this.prisma.playLine.findMany({
      where: this.buildWhere({ isEnabled: dto.isEnabled }),
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: ALL_LIMIT,
    });
    const names = await this.collectSourceService.playFromNameMap();
    return rows.map((row) => toVO(row, names.get(row.sourceFrom) ?? ''));
  }

  /** 批量启用/停用（旧站 /batch）。停用是全局的：该线路对所有影片都消失。 */
  async batch(dto: PlayLineBatchDTO): Promise<{ updated: number }> {
    const result = await this.prisma.playLine.updateMany({
      where: { id: { in: dto.ids } },
      data: { isEnabled: dto.action === 'enable' ? 1 : 0 },
    });
    return { updated: result.count };
  }

  /** 按传入顺序重排，sort = (index + 1) * 10（旧站 /sort）。 */
  async sort(dto: PlayLineSortDTO): Promise<null> {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.playLine.update({ where: { id }, data: { sort: (index + 1) * SORT_STEP } }),
      ),
    );
    return null;
  }

  private buildWhere(input: {
    id?: number;
    sourceFrom?: string;
    name?: string;
    keyword?: string;
    isEnabled?: number;
  }): Prisma.PlayLineWhereInput {
    const where: Prisma.PlayLineWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.sourceFrom !== undefined) where.sourceFrom = input.sourceFrom;
    if (input.name !== undefined) where.name = input.name;
    if (input.isEnabled !== undefined) where.isEnabled = input.isEnabled;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.OR = [
        { sourceFrom: { contains: input.keyword } },
        { name: { contains: input.keyword } },
      ];
    }
    return where;
  }
}

function toVO(row: PlayLine, sourceName: string): PlayLineVO {
  return {
    id: row.id,
    sourceFrom: row.sourceFrom,
    name: row.name,
    sort: row.sort,
    isEnabled: row.isEnabled,
    sourceName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
