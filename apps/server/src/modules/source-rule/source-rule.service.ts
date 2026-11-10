import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SourceRule } from '@prisma/client';
import { applyPlayUrlRules } from '@lcm/shared';
import type { Page } from '../../common/pagination/page';
import { toPage } from '../../common/pagination/page';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectSourceService } from '../collect-source/collect-source.service';
import type {
  SourceRuleAllDTO,
  SourceRuleApplyDTO,
  SourceRuleApplyResult,
  SourceRuleCreateDTO,
  SourceRuleDeleteDTO,
  SourceRuleGetDTO,
  SourceRulePageDTO,
  SourceRuleUpdateDTO,
  SourceRuleVO,
} from './dto/source-rule';

const ALL_LIMIT = 1000;
/** 线下重刷时按批提交，避免单条 UPDATE 撑爆 max_allowed_packet。 */
const APPLY_BATCH = 100;

/** 播放地址替换规则：采集写库前套用，另提供对历史数据的重刷。 */
@Injectable()
export class SourceRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: CollectSourceService,
  ) {}

  async create(dto: SourceRuleCreateDTO): Promise<SourceRuleVO> {
    await this.requireSource(dto.sourceId);
    await this.assertUnique(dto.sourceId, dto.kind, dto.fromUrl);
    const row = await this.prisma.sourceRule.create({ data: dto });
    return this.toVO(row, await this.sources.nameMap([row.sourceId]));
  }

  async update(dto: SourceRuleUpdateDTO): Promise<SourceRuleVO> {
    const current = await this.prisma.sourceRule.findUnique({ where: { id: dto.id } });
    if (current === null) throw new NotFoundException('规则不存在');

    const { id: _id, ...rest } = dto;
    const patch = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    const sourceId = dto.sourceId ?? current.sourceId;
    const kind = dto.kind ?? current.kind;
    const fromUrl = dto.fromUrl ?? current.fromUrl;
    const toUrl = dto.toUrl ?? current.toUrl;
    if (fromUrl === toUrl) throw new BadRequestException('原地址与新地址不能相同');
    if (sourceId !== current.sourceId) await this.requireSource(sourceId);
    await this.assertUnique(sourceId, kind, fromUrl, dto.id);

    const row = await this.prisma.sourceRule.update({ where: { id: dto.id }, data: patch });
    return this.toVO(row, await this.sources.nameMap([row.sourceId]));
  }

  async delete(dto: SourceRuleDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.sourceRule.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: SourceRuleGetDTO): Promise<SourceRuleVO> {
    const rows = await this.prisma.sourceRule.findMany({ where: this.buildWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException('规则不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return this.toVO(rows[0]!, await this.sources.nameMap([rows[0]!.sourceId]));
  }

  async page(dto: SourceRulePageDTO): Promise<Page<SourceRuleVO>> {
    const where = this.buildWhere(dto);
    if (dto.keyword !== undefined && dto.keyword.length > 0) {
      where.OR = [{ fromUrl: { contains: dto.keyword } }, { toUrl: { contains: dto.keyword } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sourceRule.count({ where }),
      this.prisma.sourceRule.findMany({
        where,
        orderBy: [{ sourceId: 'asc' }, { sort: 'asc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
    ]);
    const names = await this.sources.nameMap(rows.map((row) => row.sourceId));
    return toPage(
      rows.map((row) => this.toVO(row, names)),
      total,
      dto.pageNum,
      dto.pageSize,
    );
  }

  async all(dto: SourceRuleAllDTO): Promise<SourceRuleVO[]> {
    const rows = await this.prisma.sourceRule.findMany({
      where: this.buildWhere(dto),
      orderBy: [{ sourceId: 'asc' }, { sort: 'asc' }, { id: 'desc' }],
      take: ALL_LIMIT,
    });
    const names = await this.sources.nameMap(rows.map((row) => row.sourceId));
    return rows.map((row) => this.toVO(row, names));
  }

  /**
   * 把规则套用到已有数据。kind=2 改影片封面，kind=1 只改本源的线路。
   * confirm=false 只统计影响条数，供后台二次确认。
   */
  async apply(dto: SourceRuleApplyDTO): Promise<SourceRuleApplyResult> {
    const rule = await this.prisma.sourceRule.findUnique({ where: { id: dto.id } });
    if (rule === null) throw new NotFoundException('规则不存在');
    if (rule.isEnabled !== 1) throw new BadRequestException('规则已停用，先启用再重刷');

    if (rule.kind === 2) return this.applyCover(rule, dto.confirm);
    return this.applyPlay(rule, dto.confirm);
  }

  private async applyCover(rule: SourceRule, confirm: boolean): Promise<SourceRuleApplyResult> {
    const prefix = `${rule.fromUrl}%`;
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) AS total FROM lcm_vod WHERE cover LIKE ${prefix}
    `;
    const total = Number(rows[0]?.total ?? 0);
    if (!confirm) return { needConfirm: true, total, affected: 0 };
    if (total === 0) return { needConfirm: false, total: 0, affected: 0 };

    // cover_host 是业务列（决策：不用生成列），换前缀后必须一起重算
    await this.prisma.$executeRaw`
      UPDATE lcm_vod
      SET cover = CONCAT(${rule.toUrl}, SUBSTRING(cover, ${rule.fromUrl.length + 1})),
          cover_host = LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(CONCAT(${rule.toUrl}, SUBSTRING(cover, ${rule.fromUrl.length + 1})), '/', 3), '/', -1))
      WHERE cover LIKE ${prefix}
    `;
    return { needConfirm: false, total, affected: total };
  }

  private async applyPlay(rule: SourceRule, confirm: boolean): Promise<SourceRuleApplyResult> {
    const rows = await this.prisma.vodPlay.findMany({
      where: { sourceId: rule.sourceId, playUrl: { contains: rule.fromUrl } },
      select: { id: true, playUrl: true },
    });
    const changes: Array<{ id: number; playUrl: string }> = [];
    for (const row of rows) {
      const next = applyPlayUrlRules(row.playUrl, [rule]);
      if (next !== row.playUrl) changes.push({ id: row.id, playUrl: next });
    }
    if (!confirm) return { needConfirm: true, total: changes.length, affected: 0 };
    if (changes.length === 0) return { needConfirm: false, total: 0, affected: 0 };

    let affected = 0;
    for (let start = 0; start < changes.length; start += APPLY_BATCH) {
      const batch = changes.slice(start, start + APPLY_BATCH);
      const cases = Prisma.join(batch.map((row) => Prisma.sql`WHEN ${row.id} THEN ${row.playUrl}`), ' ');
      const ids = Prisma.join(batch.map((row) => Prisma.sql`${row.id}`));
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE lcm_vod_play SET play_url = CASE id ${cases} ELSE play_url END WHERE id IN (${ids})`,
      );
      affected += batch.length;
    }
    return { needConfirm: false, total: changes.length, affected };
  }

  private async requireSource(sourceId: number): Promise<void> {
    const count = await this.prisma.collectSource.count({ where: { id: sourceId } });
    if (count === 0) throw new NotFoundException('采集源不存在');
  }

  private async assertUnique(sourceId: number, kind: number, fromUrl: string, excludeId?: number): Promise<void> {
    const dup = await this.prisma.sourceRule.findFirst({
      where: { sourceId, kind, fromUrl, ...(excludeId === undefined ? {} : { id: { not: excludeId } }) },
    });
    if (dup !== null) throw new BadRequestException('该采集源下已有相同的原地址规则');
  }

  private buildWhere(input: {
    id?: number;
    sourceId?: number;
    kind?: number;
    fromUrl?: string;
    isEnabled?: number;
  }): Prisma.SourceRuleWhereInput {
    const where: Prisma.SourceRuleWhereInput = {};
    if (input.id !== undefined) where.id = input.id;
    if (input.sourceId !== undefined) where.sourceId = input.sourceId;
    if (input.kind !== undefined && (input.kind === 1 || input.kind === 2)) where.kind = input.kind;
    if (input.fromUrl !== undefined && input.fromUrl.length > 0) where.fromUrl = input.fromUrl;
    if (input.isEnabled !== undefined && (input.isEnabled === 0 || input.isEnabled === 1)) where.isEnabled = input.isEnabled;
    return where;
  }

  private toVO(row: SourceRule, names?: Map<number, string>): SourceRuleVO {
    return {
      id: row.id,
      sourceId: row.sourceId,
      sourceName: names?.get(row.sourceId) ?? '',
      kind: row.kind,
      fromUrl: row.fromUrl,
      toUrl: row.toUrl,
      isEnabled: row.isEnabled,
      sort: row.sort,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
