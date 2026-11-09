import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { countEpisodes, looseHash, nameHash, normalizeName } from '@lcm/shared';
import { Prisma } from '@prisma/client';
import type { Vod } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import type {
  VodAllDTO,
  VodBatchDTO,
  VodCreateDTO,
  VodDeleteDTO,
  VodDetailVO,
  VodGetDTO,
  VodPageDTO,
  VodPlayBriefVO,
  VodUpdateDTO,
  VodVO,
} from './dto/vod';

const ALL_LIMIT = 1000;

/** 封面域名：写入 cover 时同步维护（决策：cover_host 是普通列，由业务代码维护）。 */
export function coverHostOf(cover: string): string {
  if (cover.length === 0) return '';
  try {
    return new URL(cover).hostname.toLowerCase();
  } catch {
    return '';
  }
}

interface CategoryRef {
  id: number;
  pid: number;
  name: string;
  parentName: string;
}

@Injectable()
export class VodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collectSourceService: CollectSourceService,
  ) {}

  async create(dto: VodCreateDTO): Promise<VodVO> {
    const category = await this.requireCategory(dto.categoryId);
    const name = normalizeName(dto.name);
    if (name.length === 0) throw new BadRequestException('影片名称不能为空');

    const hash = nameHash(name);
    await this.assertNoDuplicate(hash, dto.year, 0);

    const row = await this.prisma.vod.create({
      data: {
        name,
        nameHash: hash,
        nameHashLoose: looseHash(name),
        categoryId: category.id,
        categoryPid: category.pid,
        subName: dto.subName,
        cover: dto.cover,
        coverHost: coverHostOf(dto.cover),
        actor: dto.actor,
        director: dto.director,
        writer: dto.writer,
        intro: dto.intro,
        content: dto.content,
        remarks: dto.remarks,
        releaseDate: dto.releaseDate,
        episodeCount: dto.episodeCount,
        area: dto.area,
        lang: dto.lang,
        year: dto.year,
        status: dto.status,
      },
    });
    return this.toVO(row, category, { playCount: 0, actualEpisodes: 0 });
  }

  /** 只更新传入的字段；改名重算 hash，换分类重算 category_pid，换封面重算 cover_host。 */
  async update(dto: VodUpdateDTO): Promise<VodVO> {
    const current = await this.prisma.vod.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('影片不存在');

    const patch: Prisma.VodUpdateInput = {};
    const { id: _id, categoryId, name: rawName, cover, ...rest } = dto;

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
    }

    if (rawName !== undefined) {
      const name = normalizeName(rawName);
      if (name.length === 0) throw new BadRequestException('影片名称不能为空');
      patch.name = name;
      patch.nameHash = nameHash(name);
      patch.nameHashLoose = looseHash(name);
    }

    if (categoryId !== undefined && categoryId !== current.categoryId) {
      const category = await this.requireCategory(categoryId);
      patch.categoryId = category.id;
      patch.categoryPid = category.pid;
    }

    if (cover !== undefined && cover !== current.cover) {
      patch.cover = cover;
      patch.coverHost = coverHostOf(cover);
    }

    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    const hash = (patch.nameHash as string | undefined) ?? current.nameHash;
    const year = (patch.year as number | undefined) ?? current.year;
    await this.assertNoDuplicate(hash, year, dto.id);

    const row = await this.prisma.vod.update({ where: { id: dto.id }, data: patch });
    const category = await this.requireCategory(row.categoryId);
    const stats = await this.statsOf([row.id]);
    return this.toVO(row, category, stats.get(row.id) ?? { playCount: 0, actualEpisodes: 0 });
  }

  /** 物理删除：影片与其全部线路在同一事务里删除。只下架请用 batch 的 status 操作。 */
  async delete(dto: VodDeleteDTO): Promise<{ deleted: number }> {
    const existing = await this.prisma.vod.count({ where: { id: { in: dto.ids } } });
    if (existing === 0) return { deleted: 0 };

    const [removed] = await this.prisma.$transaction([
      this.prisma.vod.deleteMany({ where: { id: { in: dto.ids } } }),
      this.prisma.vodPlay.deleteMany({ where: { vodId: { in: dto.ids } } }),
    ]);
    return { deleted: removed.count };
  }

  async get(dto: VodGetDTO): Promise<VodDetailVO> {
    const rows = await this.prisma.vod.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('影片不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');

    return this.detail(rows[0]!);
  }

  async page(dto: VodPageDTO): Promise<Page<VodVO>> {
    const where = this.buildWhere(dto);
    const orderBy: Prisma.VodOrderByWithRelationInput[] =
      dto.sort === 'new' ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ collectedAt: 'desc' }, { id: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vod.count({ where }),
      this.prisma.vod.findMany({
        where,
        orderBy,
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);

    const [categories, stats] = await Promise.all([
      this.categoryMap(rows.map((row) => row.categoryId)),
      this.statsOf(rows.map((row) => row.id)),
    ]);
    return toPage(
      rows.map((row) =>
        this.toVO(row, categories.get(row.categoryId), stats.get(row.id) ?? { playCount: 0, actualEpisodes: 0 }),
      ),
      total,
      dto.pageNum,
      dto.pageSize,
    );
  }

  async all(dto: VodAllDTO): Promise<VodVO[]> {
    const rows = await this.prisma.vod.findMany({
      where: this.buildWhere(dto),
      orderBy: [{ id: 'desc' }],
      take: Math.min(dto.limit, ALL_LIMIT),
    });
    const [categories, stats] = await Promise.all([
      this.categoryMap(rows.map((row) => row.categoryId)),
      this.statsOf(rows.map((row) => row.id)),
    ]);
    return rows.map((row) =>
      this.toVO(row, categories.get(row.categoryId), stats.get(row.id) ?? { playCount: 0, actualEpisodes: 0 }),
    );
  }

  /** 批量：改分类 / 上下架。 */
  async batch(dto: VodBatchDTO): Promise<{ affected: number }> {
    if (dto.action === 'category' && dto.categoryId !== undefined) {
      const category = await this.requireCategory(dto.categoryId);
      const result = await this.prisma.vod.updateMany({
        where: { id: { in: dto.ids } },
        data: { categoryId: category.id, categoryPid: category.pid },
      });
      return { affected: result.count };
    }
    if (dto.action === 'status' && dto.status !== undefined) {
      const result = await this.prisma.vod.updateMany({
        where: { id: { in: dto.ids } },
        data: { status: dto.status },
      });
      return { affected: result.count };
    }
    throw new BadRequestException('未知的批量操作');
  }

  /** 详情：整行 + 分类名 + 线路概况。 */
  private async detail(vod: Vod): Promise<VodDetailVO> {
    const categories = await this.categoryMap([vod.categoryId]);
    const plays = await this.prisma.vodPlay.findMany({
      where: { vodId: vod.id },
      orderBy: [{ id: 'asc' }],
      select: { id: true, sourceId: true, sourceFrom: true, playUrl: true },
    });
    const sourceNames = await this.collectSourceService.nameMap(plays.map((play) => play.sourceId));

    const playBriefs: VodPlayBriefVO[] = plays.map((play) => ({
      id: play.id,
      sourceId: play.sourceId,
      sourceName: play.sourceId === null ? '' : (sourceNames.get(play.sourceId) ?? ''),
      sourceFrom: play.sourceFrom,
      episodeCount: countEpisodes(play.playUrl),
    }));
    const stats = {
      playCount: playBriefs.length,
      actualEpisodes: playBriefs.reduce((max, play) => Math.max(max, play.episodeCount), 0),
    };
    const vo = this.toVO(vod, categories.get(vod.categoryId), stats) as VodDetailVO;
    return {
      ...vo,
      parentName: categories.get(vod.categoryId)?.parentName ?? '',
      subName: vod.subName,
      actor: vod.actor,
      director: vod.director,
      writer: vod.writer,
      intro: vod.intro,
      content: vod.content ?? '',
      releaseDate: vod.releaseDate,
      coverHost: vod.coverHost,
      updatedAt: vod.updatedAt.toISOString(),
      plays: playBriefs,
    };
  }

  private buildWhere(input: {
    id?: number;
    name?: string;
    categoryId?: number;
    status?: number;
    keyword?: string;
  }): Prisma.VodWhereInput {
    const where: Prisma.VodWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.name !== undefined && input.name.length > 0) where.name = input.name;
    if (input.categoryId !== undefined) {
      // 一级分类要带上所有二级分类的影片
      where.OR = [{ categoryId: input.categoryId }, { categoryPid: input.categoryId }];
    }
    if (input.status !== undefined) where.status = input.status;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.name = { contains: input.keyword };
    }
    return where;
  }

  /** 同名同年（任一方为 0 也算）视为重复。 */
  private async assertNoDuplicate(hash: string, year: number, excludeId: number): Promise<void> {
    const rows = await this.prisma.vod.findMany({
      where: { nameHash: hash, id: { not: excludeId } },
      select: { year: true },
    });
    const conflict = rows.some((row) => row.year === year || row.year === 0 || year === 0);
    if (conflict) throw new BadRequestException('已存在同名同年的影片');
  }

  private async requireCategory(categoryId: number): Promise<CategoryRef> {
    const rows = await this.prisma.category.findMany({
      where: { id: categoryId },
      select: { id: true, pid: true, name: true },
      take: 2,
    });
    const row = rows[0];
    if (row === undefined) throw new BadRequestException('分类不存在');
    const parent = row.pid > 0 ? await this.prisma.category.findUnique({ where: { id: row.pid } }) : null;
    return { id: row.id, pid: row.pid, name: row.name, parentName: parent?.name ?? '' };
  }

  private async categoryMap(ids: number[]): Promise<Map<number, CategoryRef>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.category.findMany({ where: { id: { in: unique } } });
    const parents = await this.prisma.category.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.pid))].filter((id) => id > 0) } },
    });
    const parentNames = new Map(parents.map((row) => [row.id, row.name]));
    return new Map(
      rows.map((row) => [row.id, { id: row.id, pid: row.pid, name: row.name, parentName: parentNames.get(row.pid) ?? '' }]),
    );
  }

  /** 线路数 + 各线路集数最大值（一条 SQL 取回，避免按影片逐个查）。 */
  private async statsOf(vodIds: number[]): Promise<Map<number, { playCount: number; actualEpisodes: number }>> {
    const unique = [...new Set(vodIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ vodId: number; plays: bigint; episodes: bigint }>>(
      Prisma.sql`
        SELECT vod_id AS vodId,
               COUNT(*) AS plays,
               MAX(CASE WHEN play_url = '' THEN 0
                        ELSE CHAR_LENGTH(play_url) - CHAR_LENGTH(REPLACE(play_url, '#', '')) + 1 END) AS episodes
        FROM lcm_vod_play
        WHERE vod_id IN (${Prisma.join(unique)})
        GROUP BY vod_id
      `,
    );
    return new Map(
      rows.map((row) => [Number(row.vodId), { playCount: Number(row.plays), actualEpisodes: Number(row.episodes) }]),
    );
  }

  private toVO(
    row: Prisma.VodGetPayload<object>,
    category: CategoryRef | undefined,
    stats: { playCount: number; actualEpisodes: number },
  ): VodVO {
    return {
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      categoryPid: row.categoryPid,
      categoryName: category?.name ?? '',
      cover: row.cover,
      year: row.year,
      area: row.area,
      lang: row.lang,
      remarks: row.remarks,
      status: row.status,
      episodeCount: row.episodeCount,
      playCount: stats.playCount,
      actualEpisodes: stats.actualEpisodes,
      collectedAt: row.collectedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

