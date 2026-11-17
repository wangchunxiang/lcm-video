import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { countEpisodes, parsePlayUrl } from '@lcm/shared';
import type { Episode } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { VodPlayEntity } from './vod-play.entity';
import type {
  CreateVodPlayDTO,
  DeleteManyVodPlayDTO,
  UpdateVodPlayDTO,
} from './dto/vod-play.dto';

/** 线路列表行：带解析后的集数与线路名。 */
export interface VodPlayRow extends VodPlayEntity {
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
    if (dto.ids.length === 0) return { deleted: 0 };
    const rows = await this.repository.find({ where: { id: In(dto.ids) } });
    if (dto.force !== true) await this.assertNotLastLine(rows);
    const result = await this.repository.delete(dto.ids as never);
    return { deleted: result.affected ?? 0 };
  }

  /** 某影片的全部线路（手工在前、采集按线路顺序）。 */
  async byVod(vodId: string): Promise<VodPlayRow[]> {
    const rows = await this.repository.find({ where: { vodId }, order: { id: 'ASC' } });
    return rows.map((row) => ({
      ...row,
      sourceName: row.sourceFrom,
      episodes: parsePlayUrl(row.playUrl),
      episodeCount: countEpisodes(row.playUrl),
    }));
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
