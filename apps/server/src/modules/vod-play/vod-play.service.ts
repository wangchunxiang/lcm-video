import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { countEpisodes, parsePlayUrl } from '@lcm/shared';
import type { Episode } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectSourceEntity } from '../collect-source/collect-source.entity';
import { PlayLineEntity } from '../play-line/play-line.entity';
import { VodPlayEntity } from './vod-play.entity';
import type {
  CreateVodPlayDTO,
  DeleteManyVodPlayDTO,
  UpdateVodPlayDTO,
} from './dto/vod-play.dto';

/**
 * 线路列表行：带解析后的集数、线路显示名与源站名。
 * `lineName` 取自线路注册表 `lcm_play_line.name`，`sourceName` 取自采集源 `lcm_collect_source.name`，
 * 两者都可能为空（手工线路既没有注册表行也没有源站）。
 */
export interface VodPlayRow extends VodPlayEntity {
  lineName: string;
  sourceName: string;
  episodes: Episode[];
  episodeCount: number;
}

@Injectable()
export class VodPlayService extends AppCrudService<VodPlayEntity> {
  constructor(@InjectRepository(VodPlayEntity) repository: Repository<VodPlayEntity>) {
    super(repository);
  }

  override async create(data: Partial<VodPlayEntity>): Promise<VodPlayEntity> {
    // SAFETY: body 已被 ValidationPipe 按 CreateVodPlayDTO 校验过，这里只是把宽类型收窄回 DTO。
    const dto = data as unknown as CreateVodPlayDTO;
    if (countEpisodes(dto.playUrl) === 0) throw new BadRequestException('播放地址解析不出任何集数');

    const exists = await this.repository.findOne({
      where: { vodId: dto.vodId, sourceId: IsNull(), sourceFrom: dto.sourceFrom },
    });
    if (exists !== null) throw new BadRequestException('该影片已有同名的手工线路');

    return super.create({
      vodId: dto.vodId,
      sourceId: null,
      sourceFrom: dto.sourceFrom,
      sourceVodId: '',
      sourceUpdatedAt: null,
      playUrl: dto.playUrl,
    });
  }

  override async update(
    criteria: string | FindOptionsWhere<VodPlayEntity>,
    data: Partial<VodPlayEntity>,
  ): Promise<VodPlayEntity> {
    // SAFETY: body 已被 ValidationPipe 按 UpdateVodPlayDTO 校验过，下面每个字段都做了 `!== undefined` 判断。
    const dto = data as unknown as UpdateVodPlayDTO;
    const current = await this.repository.findOne({
      where: typeof criteria === 'string' ? { id: criteria } : criteria,
    });
    if (current === null) throw new BadRequestException('线路不存在');
    if (dto.sourceFrom !== undefined && current.sourceId !== null) {
      throw new BadRequestException('采集来的线路不能改名称');
    }

    const patch: Partial<VodPlayEntity> = {};
    if (dto.sourceFrom !== undefined) patch.sourceFrom = dto.sourceFrom;
    if (dto.playUrl !== undefined) {
      if (countEpisodes(dto.playUrl) === 0) throw new BadRequestException('播放地址解析不出任何集数');
      patch.playUrl = dto.playUrl;
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有要修改的内容');
    return super.update(criteria, patch);
  }

  /** 删掉某影片的最后一条线路要显式确认。 */
  override async delete(
    criteria: string | FindOptionsWhere<VodPlayEntity>,
    softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    if (typeof criteria === 'string') {
      const row = await this.repository.findOne({ where: { id: criteria } });
      if (row === null) return { success: false, message: '线路不存在' };
      await this.assertNotLastLine([row]);
      await this.repository.delete(criteria);
      return { success: true, message: '已删除' };
    }
    return super.delete(criteria, softDelete);
  }

  /** 批量删除：同样拦「会把影片删成没有线路」的情况。 */
  async deleteManyChecked(dto: DeleteManyVodPlayDTO): Promise<{ deleted: number }> {
    const { ids } = dto;
    if (ids.length === 0) return { deleted: 0 };
    const rows = await this.repository.find({ where: { id: In(ids) } });
    if (dto.force !== true) await this.assertNotLastLine(rows);
    const result = await this.repository.delete({ id: In(ids) });
    return { deleted: result.affected ?? 0 };
  }

  /** 某影片的全部线路（手工在前、采集按线路顺序）。 */
  async byVod(vodId: string): Promise<VodPlayRow[]> {
    const rows = await this.repository.find({ where: { vodId }, order: { id: 'ASC' } });
    if (rows.length === 0) return [];

    // 线路名与源站名都不在 lcm_vod_play 上：前者按线路标识查注册表，后者按 source_id 查采集源。
    const fromValues = [
      ...new Set(rows.map((row) => row.sourceFrom).filter((from) => from !== '')),
    ];
    const sourceIds = [
      ...new Set(rows.map((row) => row.sourceId).filter((id): id is string => id !== null)),
    ];
    const [lineRows, sourceRows] = await Promise.all([
      fromValues.length === 0
        ? Promise.resolve([])
        : this.repository.manager.find(PlayLineEntity, {
            where: { sourceFrom: In(fromValues) },
            select: { sourceFrom: true, name: true },
          }),
      sourceIds.length === 0
        ? Promise.resolve([])
        : this.repository.manager.find(CollectSourceEntity, {
            where: { id: In(sourceIds) },
            select: { id: true, name: true },
          }),
    ]);
    const lineNames = new Map(lineRows.map((row) => [row.sourceFrom, row.name]));
    const sourceNames = new Map(sourceRows.map((row) => [String(row.id), row.name]));

    return rows.map((row) => {
      // 只解析一次：`episodeCount` 取解析结果的长度，别让「集数」有第二个算法
      const episodes = parsePlayUrl(row.playUrl);
      return {
        ...row,
        lineName: lineNames.get(row.sourceFrom) ?? '',
        sourceName: row.sourceId === null ? '' : (sourceNames.get(row.sourceId) ?? ''),
        episodes,
        episodeCount: episodes.length,
      };
    });
  }

  private async assertNotLastLine(rows: VodPlayEntity[]): Promise<void> {
    const byVod = new Map<string, number>();
    for (const row of rows) {
      const total =
        byVod.get(row.vodId) ?? (await this.repository.count({ where: { vodId: row.vodId } }));
      const removing = rows.filter((item) => item.vodId === row.vodId).length;
      byVod.set(row.vodId, total);
      if (total - removing <= 0) {
        throw new BadRequestException('会删掉某部影片的最后一条线路，请确认后再删除（force=true）');
      }
    }
  }
}
