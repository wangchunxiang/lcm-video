import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, VodMergeIgnore } from '@prisma/client';
import type { CrudDelegate } from '../../common/crud/crud.service';
import { CrudService, patchOf } from '../../common/crud/crud.service';
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
export class VodMergeIgnoreService extends CrudService<
  VodMergeIgnore,
  VodMergeIgnoreVO,
  VodMergeIgnoreGetDTO,
  VodMergeIgnorePageDTO,
  VodMergeIgnoreAllDTO,
  VodMergeIgnoreDeleteDTO
> {
  protected readonly label = '记录';

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected get delegate(): CrudDelegate<VodMergeIgnore> {
    return this.prisma.vodMergeIgnore as unknown as CrudDelegate<VodMergeIgnore>;
  }

  protected toVO(row: VodMergeIgnore): VodMergeIgnoreVO {
    return toVO(row);
  }

  protected getWhere(dto: VodMergeIgnoreGetDTO): Prisma.VodMergeIgnoreWhereInput {
    const where: Prisma.VodMergeIgnoreWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.mergeKey) where.mergeKey = dto.mergeKey;
    return where;
  }

  protected pageWhere(dto: VodMergeIgnorePageDTO): Prisma.VodMergeIgnoreWhereInput {
    const where: Prisma.VodMergeIgnoreWhereInput = {};
    if (dto.keyword) where.mergeKey = { contains: dto.keyword };
    if (dto.kind) where.kind = dto.kind;
    return where;
  }

  protected allWhere(dto: VodMergeIgnoreAllDTO): Prisma.VodMergeIgnoreWhereInput {
    const where: Prisma.VodMergeIgnoreWhereInput = {};
    if (dto.kind) where.kind = dto.kind;
    return where;
  }

  async create(dto: VodMergeIgnoreCreateDTO): Promise<VodMergeIgnoreVO> {
    const exists = await this.prisma.vodMergeIgnore.findUnique({ where: { mergeKey: dto.mergeKey } });
    if (exists) throw new BadRequestException('该分组已经在忽略列表里');
    return toVO(await this.prisma.vodMergeIgnore.create({ data: dto }));
  }

  async update(dto: VodMergeIgnoreUpdateDTO): Promise<VodMergeIgnoreVO> {
    await this.requireRow(dto.id);

    const { id, mergeKey, ...rest } = dto;
    void id;
    const patch = this.requirePatch(patchOf(rest as Record<string, unknown>));
    if (mergeKey !== undefined) {
      const dup = await this.prisma.vodMergeIgnore.findUnique({ where: { mergeKey } });
      if (dup && dup.id !== dto.id) throw new BadRequestException('该分组已经在忽略列表里');
      patch.mergeKey = mergeKey;
    }

    const row = await this.prisma.vodMergeIgnore.update({
      where: { id: dto.id },
      data: patch as Prisma.VodMergeIgnoreUpdateInput,
    });
    return toVO(row);
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
