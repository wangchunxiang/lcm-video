import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, VodMergeIgnore } from '@prisma/client';
import type { Page } from '../../common/pagination/page';
import { toPage } from '../../common/pagination/page';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  VodMergeIgnoreAllDTO,
  VodMergeIgnoreByKeysDTO,
  VodMergeIgnoreCreateDTO,
  VodMergeIgnoreDeleteDTO,
  VodMergeIgnoreGetDTO,
  VodMergeIgnorePageDTO,
  VodMergeIgnoreToggleDTO,
  VodMergeIgnoreUpdateDTO,
  VodMergeIgnoreVO,
} from './dto/vod-merge-ignore';

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

function toVO(row: VodMergeIgnore): VodMergeIgnoreVO {
  return {
    id: row.id,
    mergeKey: row.mergeKey,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class VodMergeIgnoreService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: VodMergeIgnoreCreateDTO): Promise<VodMergeIgnoreVO> {
    const exists = await this.prisma.vodMergeIgnore.findUnique({ where: { mergeKey: dto.mergeKey } });
    if (exists) throw new BadRequestException('该分组已经在忽略列表里');
    return toVO(await this.prisma.vodMergeIgnore.create({ data: dto }));
  }

  async update(dto: VodMergeIgnoreUpdateDTO): Promise<VodMergeIgnoreVO> {
    const current = await this.prisma.vodMergeIgnore.findUnique({ where: { id: dto.id } });
    if (!current) throw new NotFoundException('记录不存在');

    const { id, mergeKey, ...rest } = dto;
    const patch: Prisma.VodMergeIgnoreUpdateInput = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    if (mergeKey !== undefined) {
      const dup = await this.prisma.vodMergeIgnore.findUnique({ where: { mergeKey } });
      if (dup && dup.id !== id) throw new BadRequestException('该分组已经在忽略列表里');
      patch.mergeKey = mergeKey;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    return toVO(await this.prisma.vodMergeIgnore.update({ where: { id }, data: patch }));
  }

  async delete(dto: VodMergeIgnoreDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.vodMergeIgnore.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: VodMergeIgnoreGetDTO): Promise<VodMergeIgnoreVO> {
    const where: Prisma.VodMergeIgnoreWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.mergeKey) where.mergeKey = dto.mergeKey;

    const rows = await this.prisma.vodMergeIgnore.findMany({ where, take: 2 });
    if (rows.length === 0) throw new NotFoundException('记录不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return toVO(rows[0]!);
  }

  async page(dto: VodMergeIgnorePageDTO): Promise<Page<VodMergeIgnoreVO>> {
    const where: Prisma.VodMergeIgnoreWhereInput = {};
    if (dto.keyword) where.mergeKey = { contains: dto.keyword };
    if (dto.kind) where.kind = dto.kind;

    const [rows, total] = await Promise.all([
      this.prisma.vodMergeIgnore.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.vodMergeIgnore.count({ where }),
    ]);
    return toPage(rows.map(toVO), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: VodMergeIgnoreAllDTO): Promise<VodMergeIgnoreVO[]> {
    const where: Prisma.VodMergeIgnoreWhereInput = {};
    if (dto.kind) where.kind = dto.kind;
    const rows = await this.prisma.vodMergeIgnore.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ALL_LIMIT,
    });
    return rows.map(toVO);
  }

  /** 忽略 / 恢复：合并工具对同一个分组反复点也不会产生重复行 */
  async toggle(dto: VodMergeIgnoreToggleDTO): Promise<{ ignored: boolean }> {
    if (!dto.ignored) {
      await this.prisma.vodMergeIgnore.deleteMany({ where: { mergeKey: dto.mergeKey } });
      return { ignored: false };
    }

    await this.prisma.vodMergeIgnore.upsert({
      where: { mergeKey: dto.mergeKey },
      create: { mergeKey: dto.mergeKey, kind: dto.kind },
      update: { kind: dto.kind },
    });
    return { ignored: true };
  }

  /** 合并工具一次性取「这批分组里哪些被忽略」，避免逐组查询 */
  async byKeys(dto: VodMergeIgnoreByKeysDTO): Promise<{ ignored: string[] }> {
    const rows = await this.prisma.vodMergeIgnore.findMany({
      where: { mergeKey: { in: dto.keys } },
      select: { mergeKey: true },
    });
    return { ignored: rows.map((row) => row.mergeKey) };
  }
}
