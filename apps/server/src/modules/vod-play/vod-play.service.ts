import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { countEpisodes, parsePlayUrl } from '@lcm/shared';
import type { Prisma, VodPlay } from '@prisma/client';
import type { Page } from '../../common/pagination/page';
import { toPage } from '../../common/pagination/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import type {
  VodPlayAllDTO,
  VodPlayByVodDTO,
  VodPlayCreateDTO,
  VodPlayDeleteDTO,
  VodPlayDetailVO,
  VodPlayGetDTO,
  VodPlayPageDTO,
  VodPlayUpdateDTO,
  VodPlayVO,
} from './dto/vod-play';

const ALL_LIMIT = 1000;

@Injectable()
export class VodPlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collectSourceService: CollectSourceService,
  ) {}

  async create(dto: VodPlayCreateDTO): Promise<VodPlayVO> {
    const vodExists = await this.prisma.vod.count({ where: { id: dto.vodId } });
    if (vodExists === 0) throw new NotFoundException('影片不存在');
    if (countEpisodes(dto.playUrl) === 0) throw new BadRequestException('线路里至少要有一集');

    const sourceId = dto.sourceId ?? null;
    const dup = await this.prisma.vodPlay.count({
      where: { vodId: dto.vodId, sourceId, sourceFrom: dto.sourceFrom },
    });
    if (dup > 0) {
      throw new BadRequestException(
        sourceId === null ? '该影片已有同名的手工线路' : '该影片的这条采集线路已存在',
      );
    }

    const row = await this.prisma.vodPlay.create({
      data: {
        vodId: dto.vodId,
        sourceId,
        sourceFrom: dto.sourceFrom,
        sourceVodId: dto.sourceVodId,
        playUrl: dto.playUrl,
      },
    });
    return toVO(row, await this.collectSourceService.nameMap([sourceId]));
  }

  /** 采集来的线路只允许改播放地址；手工线路可以改名。 */
  async update(dto: VodPlayUpdateDTO): Promise<VodPlayVO> {
    if (dto.sourceFrom === undefined && dto.playUrl === undefined) {
      throw new BadRequestException('没有要修改的内容');
    }

    const current = await this.prisma.vodPlay.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('线路不存在');

    if (dto.sourceFrom !== undefined && dto.sourceFrom !== current.sourceFrom) {
      if (current.sourceId !== null) throw new BadRequestException('采集来的线路不能改名称');
      const dup = await this.prisma.vodPlay.count({
        where: { vodId: current.vodId, sourceId: null, sourceFrom: dto.sourceFrom, id: { not: dto.id } },
      });
      if (dup > 0) throw new BadRequestException('该影片已有同名的手工线路');
    }
    if (dto.playUrl !== undefined && countEpisodes(dto.playUrl) === 0) {
      throw new BadRequestException('线路里至少要有一集');
    }

    const row = await this.prisma.vodPlay.update({
      where: { id: dto.id },
      data: { sourceFrom: dto.sourceFrom, playUrl: dto.playUrl },
    });
    return toVO(row, await this.collectSourceService.nameMap([row.sourceId]));
  }

  /** 删掉某影片的最后一条线路需要 force=true（旧站用 409 二次确认）。 */
  async delete(dto: VodPlayDeleteDTO): Promise<{ deleted: number }> {
    const rows = await this.prisma.vodPlay.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, vodId: true },
    });
    if (rows.length === 0) return { deleted: 0 };

    if (dto.force !== true) {
      const vodIds = [...new Set(rows.map((row) => row.vodId))];
      const counts = await this.prisma.vodPlay.groupBy({
        by: ['vodId'],
        where: { vodId: { in: vodIds } },
        _count: { _all: true },
      });
      const deletedPerVod = new Map<number, number>();
      for (const row of rows) deletedPerVod.set(row.vodId, (deletedPerVod.get(row.vodId) ?? 0) + 1);

      for (const item of counts) {
        const left = item._count._all - (deletedPerVod.get(item.vodId) ?? 0);
        if (left <= 0) {
          throw new BadRequestException('会删掉某部影片的最后一条线路，请确认后再删除（force=true）');
        }
      }
    }

    const result = await this.prisma.vodPlay.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: VodPlayGetDTO): Promise<VodPlayVO> {
    const rows = await this.prisma.vodPlay.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('线路不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');

    const row = rows[0] as VodPlay;
    return toVO(row, await this.collectSourceService.nameMap([row.sourceId]));
  }

  async page(dto: VodPlayPageDTO): Promise<Page<VodPlayVO>> {
    const where = this.buildWhere(dto);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vodPlay.count({ where }),
      this.prisma.vodPlay.findMany({
        where,
        orderBy: [{ id: 'asc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    const names = await this.collectSourceService.nameMap(rows.map((row) => row.sourceId));
    return toPage(
      rows.map((row) => toVO(row, names)),
      total,
      dto.pageNum,
      dto.pageSize,
    );
  }

  async all(dto: VodPlayAllDTO): Promise<VodPlayVO[]> {
    const rows = await this.prisma.vodPlay.findMany({
      where: this.buildWhere(dto),
      orderBy: [{ id: 'asc' }],
      take: ALL_LIMIT,
    });
    const names = await this.collectSourceService.nameMap(rows.map((row) => row.sourceId));
    return rows.map((row) => toVO(row, names));
  }

  /** 某部影片的全部线路 + 解析后的剧集（详情页、编辑弹窗用）。 */
  async byVod(dto: VodPlayByVodDTO): Promise<VodPlayDetailVO[]> {
    const rows = await this.prisma.vodPlay.findMany({
      where: { vodId: dto.vodId },
      orderBy: [{ id: 'asc' }],
    });
    const names = await this.collectSourceService.nameMap(rows.map((row) => row.sourceId));
    return rows.map((row) => ({
      ...toVO(row, names),
      episodes: parsePlayUrl(row.playUrl).map((episode) => ({ name: episode.name, url: episode.url })),
    }));
  }

  private buildWhere(input: {
    id?: number;
    vodId?: number;
    sourceId?: number;
    sourceFrom?: string;
    sourceVodId?: string;
    keyword?: string;
  }): Prisma.VodPlayWhereInput {
    const where: Prisma.VodPlayWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.vodId !== undefined) where.vodId = input.vodId;
    if (input.sourceId !== undefined) where.sourceId = input.sourceId;
    if (input.sourceFrom !== undefined && input.sourceFrom.length > 0) where.sourceFrom = input.sourceFrom;
    if (input.sourceVodId !== undefined) where.sourceVodId = input.sourceVodId;
    if (input.keyword !== undefined && input.keyword.length > 0) {
      where.OR = [
        { sourceFrom: { contains: input.keyword } },
        { sourceVodId: { contains: input.keyword } },
      ];
    }
    return where;
  }
}

function toVO(row: VodPlay, sourceNames: Map<number, string>): VodPlayVO {
  return {
    id: row.id,
    vodId: row.vodId,
    sourceId: row.sourceId,
    sourceName: row.sourceId === null ? '' : (sourceNames.get(row.sourceId) ?? ''),
    sourceFrom: row.sourceFrom,
    sourceVodId: row.sourceVodId,
    sourceUpdatedAt: row.sourceUpdatedAt === null ? null : row.sourceUpdatedAt.toISOString(),
    episodeCount: countEpisodes(row.playUrl),
    collectedAt: row.collectedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
