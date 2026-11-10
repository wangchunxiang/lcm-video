import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { looseHash, nameHash } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CategoryEntity } from '../category/category.entity';
import { VodPlayEntity } from '../vod-play/vod-play.entity';
import { VodEntity } from './vod.entity';
import type { BatchVodDTO, CreateVodDTO, UpdateVodDTO } from './dto/vod.dto';

/** 列表行：影片 + 分类名 + 线路统计。 */
export interface VodRow extends VodEntity {
  categoryName: string;
  parentName: string;
  plays: number;
  episodes: number;
}

/** 从封面地址取域名，写进 `cover_host`（业务列，图片检查按它统计）。 */
export function coverHostOf(cover: string): string {
  if (cover === '') return '';
  try {
    return new URL(cover).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** 影片表：标准 REST + 批量改分类/上下架。 */
@Injectable()
export class VodService extends AppCrudService<VodEntity> {
  constructor(
    @InjectRepository(VodEntity) repository: Repository<VodEntity>,
    @InjectRepository(CategoryEntity) private readonly categoryRepository: Repository<CategoryEntity>,
    private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  override async create(data: Partial<VodEntity>): Promise<VodEntity> {
    const dto = data as unknown as CreateVodDTO;
    const category = await this.categoryRepository.findOne({ where: { id: dto.categoryId } });
    if (category === null) throw new BadRequestException('分类不存在');

    const name = dto.name.trim();
    await this.assertNoDuplicate(name, dto.year ?? 0);

    return super.create({
      categoryId: category.id,
      categoryPid: category.pid,
      name,
      nameHash: nameHash(name),
      nameHashLoose: looseHash(name),
      subName: dto.subName ?? '',
      cover: dto.cover ?? '',
      coverHost: coverHostOf(dto.cover ?? ''),
      actor: dto.actor ?? '',
      director: dto.director ?? '',
      writer: dto.writer ?? '',
      intro: dto.intro ?? '',
      content: dto.content ?? null,
      remarks: dto.remarks ?? '',
      releaseDate: dto.releaseDate ?? '',
      episodeCount: dto.episodeCount ?? 0,
      area: dto.area ?? '',
      lang: dto.lang ?? '',
      year: dto.year ?? 0,
      status: dto.status ?? 1,
    });
  }

  override async update(
    criteria: string | FindOptionsWhere<VodEntity>,
    data: Partial<VodEntity>,
  ): Promise<VodEntity> {
    const dto = data as unknown as UpdateVodDTO;
    const patch: Partial<VodEntity> = {};

    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepository.findOne({ where: { id: dto.categoryId } });
      if (category === null) throw new BadRequestException('分类不存在');
      patch.categoryId = category.id;
      patch.categoryPid = category.pid;
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const current = await this.repository.findOne({
        where: typeof criteria === 'string' ? { id: criteria } : criteria,
      });
      if (current === null) throw new BadRequestException('影片不存在');
      await this.assertNoDuplicate(name, dto.year ?? current.year, current.id);
      patch.name = name;
      patch.nameHash = nameHash(name);
      patch.nameHashLoose = looseHash(name);
    }
    if (dto.cover !== undefined) {
      patch.cover = dto.cover;
      patch.coverHost = coverHostOf(dto.cover);
    }
    if (dto.subName !== undefined) patch.subName = dto.subName;
    if (dto.actor !== undefined) patch.actor = dto.actor;
    if (dto.director !== undefined) patch.director = dto.director;
    if (dto.writer !== undefined) patch.writer = dto.writer;
    if (dto.intro !== undefined) patch.intro = dto.intro;
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.remarks !== undefined) patch.remarks = dto.remarks;
    if (dto.releaseDate !== undefined) patch.releaseDate = dto.releaseDate;
    if (dto.episodeCount !== undefined) patch.episodeCount = dto.episodeCount;
    if (dto.area !== undefined) patch.area = dto.area;
    if (dto.lang !== undefined) patch.lang = dto.lang;
    if (dto.year !== undefined) patch.year = dto.year;
    if (dto.status !== undefined) patch.status = dto.status;
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');

    return super.update(criteria, patch);
  }

  /** 删除是物理删除，连带删掉该影片的全部线路。 */
  override async delete(
    criteria: string | FindOptionsWhere<VodEntity>,
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    if (typeof criteria === 'string') {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(VodPlayEntity, { vodId: criteria });
        await manager.delete(VodEntity, { id: criteria });
      });
      return { success: true, message: '已删除' };
    }
    return super.delete(criteria, softDelete);
  }

  /** 分页：补分类名与线路统计。 */
  override async findMany(params: {
    page?: number;
    take?: number;
    skip?: number;
  }): Promise<{ items: VodRow[]; total: number }> {
    const result = await super.findMany(params as never);
    return { items: await this.decorate(result.items as VodEntity[]), total: result.total };
  }

  /** 批量改分类 / 上下架。 */
  async batch(dto: BatchVodDTO): Promise<{ updated: number }> {
    if (dto.ids.length === 0) return { updated: 0 };
    if (dto.action === 'status') {
      const status = dto.status ?? 1;
      const result = await this.repository.update({ id: dto.ids as never }, { status });
      return { updated: result.affected ?? 0 };
    }
    if (dto.categoryId === undefined) throw new BadRequestException('请选择要移动到的分类');
    const category = await this.categoryRepository.findOne({ where: { id: dto.categoryId } });
    if (category === null) throw new BadRequestException('分类不存在');
    const result = await this.repository.update(
      { id: dto.ids as never },
      { categoryId: category.id, categoryPid: category.pid },
    );
    return { updated: result.affected ?? 0 };
  }

  /** 给一组影片补分类名与线路统计（一条 SQL 聚合，避免 N+1）。 */
  private async decorate(rows: VodEntity[]): Promise<VodRow[]> {
    if (rows.length === 0) return [];

    const categories = await this.categoryRepository.find({ select: ['id', 'name', 'pid'] });
    const nameById = new Map(categories.map((item) => [item.id, item.name]));

    const ids = rows.map((row) => row.id);
    const stats = await this.dataSource.query<
      Array<{ vodId: string; plays: string; episodes: string }>
    >(
      `SELECT vod_id AS vodId, COUNT(*) AS plays,
              MAX(CASE WHEN play_url = '' THEN 0
                       ELSE CHAR_LENGTH(play_url) - CHAR_LENGTH(REPLACE(play_url, '#', '')) + 1 END) AS episodes
         FROM lcm_vod_play WHERE vod_id IN (?) GROUP BY vod_id`,
      [ids],
    );
    const statById = new Map(stats.map((item) => [String(item.vodId), item]));

    return rows.map((row) => {
      const stat = statById.get(row.id);
      return {
        ...row,
        categoryName: nameById.get(row.categoryId) ?? '',
        parentName: nameById.get(row.categoryPid) ?? '',
        plays: stat === undefined ? 0 : Number(stat.plays),
        episodes: stat === undefined ? 0 : Number(stat.episodes),
      };
    });
  }

  /** 同名同年的判重：两边年份任一为 0 也视为冲突（与采集入库规则一致）。 */
  private async assertNoDuplicate(name: string, year: number, excludeId?: string): Promise<void> {
    const rows = await this.repository.find({ where: { nameHash: nameHash(name) } });
    const conflict = rows.find(
      (row) => row.id !== excludeId && (row.year === year || row.year === 0 || year === 0),
    );
    if (conflict !== undefined) throw new BadRequestException('已存在同名同年的影片');
  }
}
