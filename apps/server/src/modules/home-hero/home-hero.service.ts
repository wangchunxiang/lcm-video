import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { HomeHeroEntity } from './home-hero.entity';
import type { CreateHomeHeroDTO, UpdateHomeHeroDTO } from './dto/home-hero.dto';

/** 新建时没传 `sort` 就排在最后：取当前最大值 + 10，留出插入空间 */
const SORT_STEP = 10;

/**
 * 首页 hero 轮播位。
 *
 * 只做三件额外的事：校验影片存在、同片不能占两个位（靠 `uk_vod`，这里翻译成中文提示）、
 * 新建时补默认排序。覆盖字段的空串语义由前台拼装时处理，这里只做 trim。
 */
@Injectable()
export class HomeHeroService extends AppCrudService<HomeHeroEntity> {
  constructor(
    @InjectRepository(HomeHeroEntity) repository: Repository<HomeHeroEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  override async create(data: Partial<HomeHeroEntity>): Promise<HomeHeroEntity> {
    const dto = data as unknown as CreateHomeHeroDTO;
    await this.assertVod(dto.vodId);
    const sort = dto.sort ?? (await this.nextSort());
    return this.withDuplicateHint(() =>
      super.create({ ...this.normalize(dto), vodId: dto.vodId, sort } as Partial<HomeHeroEntity>),
    );
  }

  override async update(
    criteria: string | Record<string, unknown>,
    data: Partial<HomeHeroEntity>,
  ): Promise<HomeHeroEntity> {
    const dto = data as unknown as UpdateHomeHeroDTO;
    if (dto.vodId !== undefined) await this.assertVod(dto.vodId);
    return this.withDuplicateHint(() =>
      super.update(criteria as string, this.normalize(dto) as Partial<HomeHeroEntity>),
    );
  }

  /** 覆盖字段 trim；时间列允许显式传 null 清空 */
  private normalize(
    dto: CreateHomeHeroDTO | UpdateHomeHeroDTO,
  ): Partial<HomeHeroEntity> {
    const patch: Partial<HomeHeroEntity> = {};
    const textFields = ['title', 'subTitle', 'bgImage', 'remarks'] as const;
    for (const key of textFields) {
      const value = dto[key];
      if (value !== undefined) patch[key] = value.trim();
    }
    if (dto.isShow !== undefined) patch.isShow = dto.isShow;
    if (dto.sort !== undefined) patch.sort = dto.sort;
    if (dto.startAt !== undefined) patch.startAt = toDate(dto.startAt);
    if (dto.endAt !== undefined) patch.endAt = toDate(dto.endAt);
    return patch;
  }

  private async assertVod(vodId: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM lcm_vod WHERE id = ? LIMIT 1',
      [vodId],
    );
    if (!rows.length) throw new BadRequestException('影片不存在');
  }

  private async nextSort(): Promise<number> {
    const rows = await this.dataSource.query<Array<{ next: string | number }>>(
      'SELECT COALESCE(MAX(sort), 0) + ? AS next FROM lcm_home_hero',
      [SORT_STEP],
    );
    return Number(rows[0]?.next ?? SORT_STEP);
  }

  /** `uk_vod` 冲突时给出可读提示，而不是把 MySQL 的 1062 抛给前端 */
  private async withDuplicateHint<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new BadRequestException('这部影片已经在首页 hero 里了');
      }
      throw error;
    }
  }
  /** 后台表格：配置行 + 影片名/封面，按 `sort` 排好（上限 200，hero 位不会有这么多） */
  async rows(): Promise<HomeHeroRow[]> {
    const rows = await this.dataSource.query<HomeHeroRawRow[]>(
      `SELECT h.id, h.vod_id AS vodId, h.title, h.sub_title AS subTitle, h.bg_image AS bgImage,
              h.remarks, h.sort, h.is_show AS isShow, h.start_at AS startAt, h.end_at AS endAt,
              COALESCE(v.name, '') AS vodName, COALESCE(v.cover, '') AS vodCover,
              COALESCE(v.year, 0) AS vodYear, COALESCE(v.remarks, '') AS vodRemarks,
              COALESCE(c.name, '') AS categoryName
         FROM lcm_home_hero h
         LEFT JOIN lcm_vod v ON v.id = h.vod_id
         LEFT JOIN lcm_category c ON c.id = v.category_id
        ORDER BY h.sort ASC, h.id ASC
        LIMIT 200`,
    );
    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      vodYear: Number(row.vodYear),
      sort: Number(row.sort),
      isShow: Number(row.isShow),
      startAt: row.startAt ? new Date(row.startAt) : null,
      endAt: row.endAt ? new Date(row.endAt) : null,
      live: Number(row.isShow) === 1 && inWindow(row.startAt, row.endAt, now),
    }));
  }

}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  return new Date(value);
}

/** 后台表格行：配置 + 影片信息一次给全 */
export interface HomeHeroRow {
  id: string;
  vodId: string;
  vodName: string;
  vodCover: string;
  vodYear: number;
  vodRemarks: string;
  categoryName: string;
  title: string;
  subTitle: string;
  bgImage: string;
  remarks: string;
  sort: number;
  isShow: number;
  startAt: Date | null;
  endAt: Date | null;
  /** 按当前时间算是否真的在轮播（is_show = 1 且落在上下线区间内） */
  live: boolean;
}

/** 原生查询回的原始行：计数与日期列可能是字符串，统一在 `rows()` 里转 */
type HomeHeroRawRow = {
  id: string;
  vodId: string;
  title: string;
  subTitle: string;
  bgImage: string;
  remarks: string;
  sort: string | number;
  isShow: string | number;
  startAt: Date | string | null;
  endAt: Date | string | null;
  vodName: string;
  vodCover: string;
  vodYear: string | number;
  vodRemarks: string;
  categoryName: string;
};

/** 上下线时间窗口判断：空表示不限制 */
function inWindow(start: Date | string | null, end: Date | string | null, now: number): boolean {
  const startAt = start ? new Date(start).getTime() : 0;
  const endAt = end ? new Date(end).getTime() : 0;
  if (startAt && startAt > now) return false;
  if (endAt && endAt <= now) return false;
  return true;
}
