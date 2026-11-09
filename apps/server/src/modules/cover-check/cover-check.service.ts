import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CoverCheck } from '@prisma/client';
import type { Page } from '../../common/page';
import { toPage } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CoverCheckAllDTO,
  CoverCheckCreateDTO,
  CoverCheckDeleteDTO,
  CoverCheckGetDTO,
  CoverCheckHostVodsDTO,
  CoverCheckPageDTO,
  CoverCheckUpdateDTO,
  CoverCheckVO,
  CoverCheckHostVO,
  CoverCheckSummaryVO,
} from './dto/cover-check';

/** 查询全部时的硬上限（决策 2.9）。 */
const ALL_LIMIT = 1000;

function toVO(row: CoverCheck): CoverCheckVO {
  return {
    id: row.id,
    host: row.host,
    vodCount: row.vodCount,
    status: row.status,
    sampleOk: row.sampleOk,
    sampleFail: row.sampleFail,
    message: row.message,
    checkedAt: row.checkedAt ? row.checkedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CoverCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CoverCheckCreateDTO): Promise<CoverCheckVO> {
    const exists = await this.prisma.coverCheck.findUnique({ where: { host: dto.host } });
    if (exists) throw new BadRequestException('该域名已经在检查列表里');
    const { checkedAt, ...rest } = dto;
    const row = await this.prisma.coverCheck.create({
      data: { ...rest, checkedAt: checkedAt ?? undefined },
    });
    return toVO(row);
  }

  async update(dto: CoverCheckUpdateDTO): Promise<CoverCheckVO> {
    const current = await this.prisma.coverCheck.findUnique({ where: { id: dto.id } });
    if (!current) throw new NotFoundException('记录不存在');

    const { id, checkedAt, ...rest } = dto;
    const patch: Prisma.CoverCheckUpdateInput = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    if (checkedAt !== undefined) patch.checkedAt = checkedAt ?? null;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    return toVO(await this.prisma.coverCheck.update({ where: { id }, data: patch }));
  }

  async delete(dto: CoverCheckDeleteDTO): Promise<{ deleted: number }> {
    const result = await this.prisma.coverCheck.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  async get(dto: CoverCheckGetDTO): Promise<CoverCheckVO> {
    const where: Prisma.CoverCheckWhereInput = {};
    if (dto.id) where.id = dto.id;
    if (dto.host) where.host = dto.host;

    const rows = await this.prisma.coverCheck.findMany({ where, take: 2 });
    if (rows.length === 0) throw new NotFoundException('记录不存在');
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return toVO(rows[0]!);
  }

  async page(dto: CoverCheckPageDTO): Promise<Page<CoverCheckVO>> {
    const where: Prisma.CoverCheckWhereInput = {};
    if (dto.host) where.host = { contains: dto.host };
    if (dto.status !== undefined) where.status = dto.status;

    const [rows, total] = await Promise.all([
      this.prisma.coverCheck.findMany({
        where,
        orderBy: [{ vodCount: 'desc' }, { id: 'desc' }],
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.coverCheck.count({ where }),
    ]);
    return toPage(rows.map(toVO), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: CoverCheckAllDTO): Promise<CoverCheckVO[]> {
    const where: Prisma.CoverCheckWhereInput = {};
    if (dto.status !== undefined) where.status = dto.status;
    const rows = await this.prisma.coverCheck.findMany({
      where,
      orderBy: [{ vodCount: 'desc' }, { id: 'desc' }],
      take: ALL_LIMIT,
    });
    return rows.map(toVO);
  }

  /**
   * 后台图片检查页的主列表：域名来自影片表实时统计，
   * 检查结果来自本表快照，没检查过的显示 0（未检查）。
   */
  async hosts(): Promise<{ items: CoverCheckHostVO[]; summary: CoverCheckSummaryVO }> {
    const counted = await this.prisma.$queryRaw<Array<{ host: string; vodCount: bigint | number }>>`
      SELECT cover_host AS host, COUNT(*) AS vodCount
      FROM lcm_vod
      WHERE cover_host <> ''
      GROUP BY cover_host
      ORDER BY COUNT(*) DESC
    `;

    const states = await this.prisma.coverCheck.findMany();
    const stateMap = new Map(states.map((row) => [row.host, row]));

    const items: CoverCheckHostVO[] = [];
    for (const row of counted) {
      const host = String(row.host);
      // 本地路径封面（/uploads/xxx.jpg）会被解析成文件名，这里按域名形状过滤
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) continue;
      if (/\.(jpe?g|png|gif|webp|avif|svg)$/i.test(host)) continue;

      const state = stateMap.get(host);
      items.push({
        host,
        vodCount: Number(row.vodCount),
        status: state?.status ?? 0,
        sampleOk: state?.sampleOk ?? 0,
        sampleFail: state?.sampleFail ?? 0,
        message: state?.message ?? '',
        checkedAt: state?.checkedAt ? state.checkedAt.toISOString() : null,
      });
    }

    return {
      items,
      summary: {
        hosts: items.length,
        ok: items.filter((item) => item.status === 1).length,
        bad: items.filter((item) => item.status === 2).length,
        unverified: items.filter((item) => item.status === 3).length,
        unchecked: items.filter((item) => item.status === 0).length,
      },
    };
  }

  /** 某域名下的影片（封面、状态），供批量换封面/清空前的预览 */
  async hostVods(dto: CoverCheckHostVodsDTO): Promise<Page<{ id: number; name: string; cover: string; status: number }>> {
    const where: Prisma.VodWhereInput = { coverHost: dto.host };
    const [rows, total] = await Promise.all([
      this.prisma.vod.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
        select: { id: true, name: true, cover: true, status: true },
      }),
      this.prisma.vod.count({ where }),
    ]);
    return toPage(rows, total, dto.pageNum, dto.pageSize);
  }
}
