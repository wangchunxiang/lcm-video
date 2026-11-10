import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdFeature, Prisma } from '@prisma/client';
import type { Page } from '../../common/pagination/page';
import { toPage } from '../../common/pagination/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import { analyzeSource, pickSampleVods } from '../../jobs/ads/analyze';
import { cleanPlaylist } from '../../jobs/ads/skip';
import type {
  AdFeatureAllDTO,
  AdFeatureAnalyzeDTO,
  AdFeatureBySourceDTO,
  AdFeatureCreateDTO,
  AdFeatureDeleteDTO,
  AdFeatureGetDTO,
  AdFeaturePageDTO,
  AdFeatureUpdateDTO,
  AdFeatureVO,
} from './dto/ad-feature';

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

@Injectable()
export class AdFeatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: CollectSourceService,
  ) {}

  /** 同一采集源 + 同一时长序列只留一条：人工确认时覆盖旧的命中数 */
  async create(dto: AdFeatureCreateDTO): Promise<AdFeatureVO> {
    const source = await this.prisma.collectSource.findUnique({
      where: { id: dto.sourceId },
      select: { id: true },
    });
    if (!source) throw new BadRequestException('采集源不存在');

    // 只更新调用方明确传的字段：人工确认时前端会带全量，脚本调用可能只带命中数
    const update: Prisma.AdFeatureUpdateInput = {};
    if (dto.kind !== undefined) update.kind = dto.kind;
    if (dto.totalMs !== undefined) update.totalMs = dto.totalMs;
    if (dto.hitVods !== undefined) update.hitVods = dto.hitVods;
    if (dto.sample !== undefined) update.sample = dto.sample ?? undefined;

    const row = await this.prisma.adFeature.upsert({
      where: { sourceId_durations: { sourceId: dto.sourceId, durations: dto.durations } },
      create: {
        sourceId: dto.sourceId,
        durations: dto.durations,
        kind: dto.kind ?? 2,
        totalMs: dto.totalMs ?? 0,
        hitVods: dto.hitVods ?? 0,
        sample: dto.sample ?? undefined,
      },
      update,
    });
    return (await this.toVOList([row]))[0]!;
  }

  async update(dto: AdFeatureUpdateDTO): Promise<AdFeatureVO> {
    const current = await this.prisma.adFeature.findUnique({ where: { id: dto.id } });
    if (!current) throw new NotFoundException('广告特征不存在');

    const { id, sample, ...rest } = dto;
    const patch: Prisma.AdFeatureUpdateInput = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    if (sample !== undefined) patch.sample = sample ?? undefined;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    const row = await this.prisma.adFeature.update({ where: { id }, data: patch });
    return (await this.toVOList([row]))[0]!;
  }

  async delete(dto: AdFeatureDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.adFeature.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: AdFeatureGetDTO): Promise<AdFeatureVO> {
    const where: Prisma.AdFeatureWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.durations) where.durations = dto.durations;

    const rows = await this.prisma.adFeature.findMany({ where, take: 2 });
    if (rows.length === 0) throw new NotFoundException('广告特征不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return (await this.toVOList([rows[0]!]))[0]!;
  }

  async page(dto: AdFeaturePageDTO): Promise<Page<AdFeatureVO>> {
    const where: Prisma.AdFeatureWhereInput = {};
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.kind) where.kind = dto.kind;

    const [rows, total] = await Promise.all([
      this.prisma.adFeature.findMany({
        where,
        orderBy: [{ hitVods: 'desc' }, { totalMs: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.adFeature.count({ where }),
    ]);

    return toPage(await this.toVOList(rows), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: AdFeatureAllDTO): Promise<AdFeatureVO[]> {
    const where: Prisma.AdFeatureWhereInput = {};
    if (dto.sourceId) where.sourceId = dto.sourceId;
    if (dto.kind) where.kind = dto.kind;

    const rows = await this.prisma.adFeature.findMany({
      where,
      orderBy: [{ hitVods: 'desc' }, { totalMs: 'desc' }, { id: 'desc' }],
      take: ALL_LIMIT,
    });
    return this.toVOList(rows);
  }

  /** 采集源详情页里「已确认的广告特征」列表，按命中影片数排序 */
  async bySource(dto: AdFeatureBySourceDTO): Promise<AdFeatureVO[]> {
    return this.all({ sourceId: dto.sourceId });
  }

  private async toVOList(rows: AdFeature[]): Promise<AdFeatureVO[]> {
    if (rows.length === 0) return [];
    const sourceNames = await this.sources.nameMap(rows.map((row) => row.sourceId));

    return rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      sourceName: sourceNames.get(row.sourceId) ?? '',
      kind: row.kind,
      durations: row.durations,
      totalMs: row.totalMs,
      hitVods: row.hitVods,
      sample: row.sample,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
/**
   * 随机抽 `SAMPLE_SIZE` 部作品用于预览：只取有播放地址、状态正常的影片。
   * 抽样逻辑在 jobs/ads/analyze.ts，和真正跑分析时用的是同一份。
   */
  async pick(dto: AdFeatureAnalyzeDTO) {
    await this.assertSource(dto.sourceId);
    const items = await pickSampleVods(this.prisma, dto.sourceId);
    return { items };
  }

  /**
   * 执行广告特征分析。日志通过回调边跑边推，由控制器转成 NDJSON 流。
   * 只算候选，不落库——落库要人工确认（create 的 upsert）。
   */
  async analyze(dto: AdFeatureAnalyzeDTO, onLog: (line: string) => void) {
    await this.assertSource(dto.sourceId);
    return analyzeSource(this.prisma, dto.sourceId, onLog);
  }

  /** 播放代理用：按该源已确认的特征剔除上游播放列表里的广告分片 */
  cleanPlaylist(sourceId: number, url: string) {
    return cleanPlaylist(this.prisma, sourceId, url);
  }

  private async assertSource(sourceId: number): Promise<void> {
    const source = await this.prisma.collectSource.findUnique({
      where: { id: sourceId },
      select: { id: true },
    });
    if (!source) throw new NotFoundException('采集源不存在');
  }
}
