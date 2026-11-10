import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { PlayLineEntity } from './play-line.entity';

@Injectable()
export class PlayLineService extends AppCrudService<PlayLineEntity> {
  constructor(
    @InjectRepository(PlayLineEntity) repository: Repository<PlayLineEntity>,
    private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  /** 新建前校验标识唯一（库里的唯一索引会抛英文错误，这里给中文提示）。 */
  override async create(data: Partial<PlayLineEntity>): Promise<PlayLineEntity> {
    const sourceFrom = String(data.sourceFrom ?? '').trim();
    if (sourceFrom === '') throw new BadRequestException('线路标识不能为空');
    const exists = await this.repository.findOne({ where: { sourceFrom } });
    if (exists !== null) throw new BadRequestException(`线路标识 ${sourceFrom} 已存在`);
    return super.create({ ...data, sourceFrom, name: data.name ?? '' });
  }

  /** 线路标识是对 `lcm_vod_play.source_from` 的 join 键，改了会让历史数据失去关联。 */
  override async update(
    criteria: string | FindOptionsWhere<PlayLineEntity>,
    data: Partial<PlayLineEntity>,
  ): Promise<PlayLineEntity> {
    if (data.sourceFrom !== undefined) {
      throw new BadRequestException('线路标识创建后不可修改');
    }
    return super.update(criteria, data);
  }

  /** 拖拽排序：按传入顺序重排为 10、20、30…，一次事务写完。 */
  async sort(ids: string[]): Promise<{ updated: number }> {
    if (ids.length === 0) throw new BadRequestException('没有要排序的线路');
    const rows = await this.repository.find({
      where: ids.map((id) => ({ id })),
      select: { id: true },
    });
    if (rows.length !== ids.length) throw new BadRequestException('有线路已被删除，请刷新后重试');

    await this.dataSource.transaction(async (manager) => {
      for (const [index, id] of ids.entries()) {
        await manager.update(PlayLineEntity, { id }, { sort: (index + 1) * 10 });
      }
    });
    return { updated: ids.length };
  }

  /** 批量启停：`isEnabled = 0` 是全局开关，影响所有影片在该线路上的展示。 */
  async switchMany(ids: string[], isEnabled: number): Promise<{ updated: number }> {
    if (ids.length === 0) throw new BadRequestException('没有要修改的线路');
    const result = await this.repository.update(ids, { isEnabled });
    return { updated: result.affected ?? 0 };
  }

  /** 线路 → 采集源名：`lcm_collect_source.play_from` 是逗号串，反查第一条命中的源。 */
  async sourceNameMap(): Promise<Map<string, string>> {
    const rows = await this.dataSource.query<Array<{ name: string; playFrom: string }>>(
      'SELECT name, play_from AS playFrom FROM lcm_collect_source WHERE play_from <> \'\'',
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      for (const key of row.playFrom.split(',')) {
        const trimmed = key.trim();
        if (trimmed !== '' && !map.has(trimmed)) map.set(trimmed, row.name);
      }
    }
    return map;
  }
}
