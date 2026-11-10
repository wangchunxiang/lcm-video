import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Page } from '../pagination/page';
import { toPage } from '../pagination/page';

/** 查询全部时的硬上限（决策 2.9）。 */
export const ALL_LIMIT = 1000;

/**
 * Prisma 模型上真正用到的那几个方法。
 * 参数一律收成 unknown —— 各模型的 WhereInput 结构不同，只要形状对得上就能传进来。
 */
export interface CrudDelegate<Row> {
  findMany(args: {
    where?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<Row[]>;
  findUnique(args: { where: { id: number } }): Promise<Row | null>;
  deleteMany(args: { where: unknown }): Promise<{ count: number }>;
  count(args: { where?: unknown }): Promise<number>;
}

/**
 * 六件套里「读 + 删」的公共实现：get / page / all / delete。
 *
 * 为什么只有四个：create 与 update 每张表的校验、补字段、联动写库都不一样
 * （影片要算 name_hash / cover_host，采集源要查重，账号要处理密码版本），
 * 硬塞进基类只会变成一堆钩子。这两个方法留在各自的 service 里，用 patchOf() 收尾。
 */
export abstract class CrudService<Row extends { id: number }, VO, GetDTO, PageDTO, AllDTO, DeleteDTO> {
  /** 报错文案里的实体名，例如「任务」「线路」。 */
  protected abstract readonly label: string;
  protected abstract readonly delegate: CrudDelegate<Row>;

  protected abstract toVO(row: Row): VO | Promise<VO>;
  protected abstract getWhere(dto: GetDTO): unknown;
  protected abstract pageWhere(dto: PageDTO): unknown;
  protected abstract allWhere(dto: AllDTO): unknown;

  /** 默认按创建时间倒序，需要的表覆盖它。 */
  protected pageOrder(): unknown {
    return [{ createdAt: 'desc' }, { id: 'desc' }];
  }

  /** 列表页与「查询全部」的排序常常不同（明细页就是倒序、导出是正序）。 */
  protected allOrder(): unknown {
    return this.pageOrder();
  }

  /** 删除前的业务拦截（运行中不能删、有子分类不能删……）。 */
  protected async beforeDelete(ids: number[]): Promise<void> {
    void ids;
  }

  /** 多条一起转 VO，子类要批量补关联字段（源名、分类名）时覆盖它，避免 N+1。 */
  protected toVOList(rows: Row[]): Promise<VO[]> {
    return Promise.all(rows.map((row) => this.toVO(row)));
  }

  /** 任意条件命中必须唯一：0 条报不存在，多条报条件不唯一。 */
  async get(dto: GetDTO): Promise<VO> {
    const rows = await this.delegate.findMany({ where: this.getWhere(dto), take: 2 });
    if (rows.length === 0) throw new NotFoundException(`${this.label}不存在`);
    if (rows.length > 1) throw new BadRequestException('条件不唯一，请补充更精确的查询条件');
    return this.toVO(rows[0]!);
  }

  async page(dto: PageDTO & { pageNum: number; pageSize: number }): Promise<Page<VO>> {
    const where = this.pageWhere(dto);
    const [rows, total] = await Promise.all([
      this.delegate.findMany({
        where,
        orderBy: this.pageOrder(),
        skip: (dto.pageNum - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.delegate.count({ where }),
    ]);
    return toPage(await this.toVOList(rows), total, dto.pageNum, dto.pageSize);
  }

  async all(dto: AllDTO): Promise<VO[]> {
    const rows = await this.delegate.findMany({
      where: this.allWhere(dto),
      orderBy: this.allOrder(),
      take: ALL_LIMIT,
    });
    return this.toVOList(rows);
  }

  async delete(dto: DeleteDTO & { ids: number[] }): Promise<{ deleted: number }> {
    await this.beforeDelete(dto.ids);
    const result = await this.delegate.deleteMany({ where: { id: { in: dto.ids } } });
    return { deleted: result.count };
  }

  /** update 用：去掉没传的字段，得到真正要写的 patch。 */
  protected requirePatch(patch: Record<string, unknown>): Record<string, unknown> {
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');
    return patch;
  }

  /** update 用：先确认记录存在，再更新，避免 Prisma 的 P2025 直接冒到前端。 */
  protected async requireRow(id: number): Promise<Row> {
    const row = await this.delegate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`${this.label}不存在`);
    return row;
  }
}

/** 把 DTO 里 undefined 的键剔掉，只留调用方真正传了的字段。 */
export function patchOf(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}
