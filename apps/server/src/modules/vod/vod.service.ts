import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { looseHash, nameHash } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CategoryEntity } from '../category/category.entity';
import { VodPlayEntity } from '../vod-play/vod-play.entity';
import { VodEntity } from './vod.entity';
import type { BatchVodDTO } from './dto/batch-vod.dto';
import type { CreateVodDTO } from './dto/create-vod.dto';
import type { UpdateVodDTO } from './dto/update-vod.dto';
import type { VodRow } from './dto/vod-response.dto';
import { CollectClient } from '../collect/client';
import { loadBrokenCoverHosts, loadMergeConfig } from '../collect/merge';
import { parseVodPage } from '../collect/parser';
import { processPage } from '../collect/writer';
import type { CategoryInfo, FailItem, MappingInfo, SourceVod } from '../collect/types';
import { CoverCheckEntity } from '../cover-check/cover-check.entity';
import { SettingEntity } from '../setting/setting.entity';

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
    @InjectRepository(SettingEntity) private readonly settingRepository: Repository<SettingEntity>,
    @InjectRepository(CoverCheckEntity) private readonly coverCheckRepository: Repository<CoverCheckEntity>,
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
  /** 重新采集单片：回源站取这一部，按当前入库规则覆盖。 */
  async recollect(dto: {
    id: string;
    sourceId?: string;
  }): Promise<{ inserted: number; updated: number; failed: number; fails: FailItem[] }> {
    const vod = await this.repository.findOne({ where: { id: dto.id }, select: { id: true } });
    if (vod === null) throw new NotFoundException('影片不存在');

    const plays = await this.dataSource.query<
      Array<{ sourceId: string | null; sourceVodId: string }>
    >('SELECT source_id AS sourceId, source_vod_id AS sourceVodId FROM lcm_vod_play WHERE vod_id = ?', [
      dto.id,
    ]);
    const candidates = plays.filter((row) => (row.sourceId ?? '') !== '' && row.sourceVodId !== '');
    const target =
      dto.sourceId === undefined
        ? candidates[0]
        : candidates.find((row) => row.sourceId === dto.sourceId);
    if (target === undefined) {
      throw new BadRequestException(
        dto.sourceId === undefined
          ? '该影片没有可回溯的采集来源，无法重新采集'
          : '该影片没有来自这个采集源的线路，无法重新采集',
      );
    }

    const sources = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        apiUrl: string;
        apiParams: string;
        intervalSec: number;
        timeout: number;
        retryTimes: number;
        pagesize: number;
        isEnabled: number;
      }>
    >(
      `SELECT id, name, api_url AS apiUrl, api_params AS apiParams, interval_sec AS intervalSec,
              timeout, retry_times AS retryTimes, pagesize, is_enabled AS isEnabled
         FROM lcm_collect_source WHERE id = ? LIMIT 1`,
      [target.sourceId],
    );
    const source = sources[0];
    if (source === undefined) throw new BadRequestException('采集源已不存在');
    if (source.isEnabled === 0) throw new BadRequestException('采集源已停用，先启用再重新采集');

    const client = new CollectClient({
      id: source.id,
      name: source.name,
      apiUrl: source.apiUrl,
      apiParams: source.apiParams,
      intervalSec: source.intervalSec,
      timeout: source.timeout,
      retryTimes: source.retryTimes,
      pagesize: source.pagesize,
    });

    let item: SourceVod | undefined;
    try {
      const raw = await client.request({ ac: 'detail', ids: target.sourceVodId, at: 'json' });
      const parsed = parseVodPage(raw);
      item = parsed.list.find((row) => row.vodId === target.sourceVodId) ?? parsed.list[0];
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '采集失败');
    }
    if (item === undefined) throw new BadRequestException('源站没有返回该影片');

    const mappings = await this.dataSource.query<
      Array<{ categoryId: string; status: number }>
    >(
      'SELECT category_id AS categoryId, status FROM lcm_collect_source_category WHERE source_id = ? AND source_type_id = ? LIMIT 1',
      [source.id, item.typeId],
    );
    const mappingRow = mappings[0];
    if (mappingRow === undefined || mappingRow.status !== 1 || mappingRow.categoryId === '0') {
      throw new BadRequestException(
        `该片所属源站分类（${item.typeName}）未映射，请先在分类映射里处理`,
      );
    }

    const mapping = new Map<string, MappingInfo>();
    mapping.set(item.typeId, { categoryId: mappingRow.categoryId, status: mappingRow.status });

    const result = await processPage(this.dataSource, {
      sourceId: source.id,
      items: [item],
      mapping,
      categories: await this.loadCategoryMap(),
      forceVodId: dto.id,
      keepCollectedAt: true,
      merge: await loadMergeConfig(this.settingRepository),
      brokenCoverHosts: await loadBrokenCoverHosts(this.coverCheckRepository),
    });

    return {
      inserted: result.counters.inserted,
      updated: result.counters.updated,
      failed: result.counters.failed,
      fails: result.fails,
    };
  }

  /** 分类信息表：入库时按源站分类取本站分类名与别名关键词。 */
  private async loadCategoryMap(): Promise<Map<string, CategoryInfo>> {
    const rows = await this.dataSource.query<
      Array<{ id: string; pid: string; name: string; matchNames: string }>
    >('SELECT id, pid, name, match_names AS matchNames FROM lcm_category');
    const map = new Map<string, CategoryInfo>();
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        pid: row.pid,
        name: row.name,
        matchNames: row.matchNames === '' ? [] : row.matchNames.split(/[,，]/),
      });
    }
    return map;
  }

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
