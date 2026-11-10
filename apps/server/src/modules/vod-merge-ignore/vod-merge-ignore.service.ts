import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { VodMergeIgnoreEntity } from './vod-merge-ignore.entity';

/** 重复影片忽略名单：标准 REST + 幂等开关 + 批量查询。 */
@Injectable()
export class VodMergeIgnoreService extends AppCrudService<VodMergeIgnoreEntity> {
  constructor(@InjectRepository(VodMergeIgnoreEntity) repository: Repository<VodMergeIgnoreEntity>) {
    super(repository);
  }

  /** 切换忽略状态：已忽略则删除，未忽略则写入。 */
  async toggle(
    mergeKey: string,
    kind: number,
    ignored: boolean,
  ): Promise<{ ignored: boolean; id: string }> {
    const existing = await this.repository.findOne({ where: { mergeKey } });
    if (ignored) {
      if (existing !== null) return { ignored: true, id: existing.id };
      const row = await this.repository.save(
        this.repository.create({ mergeKey, kind }),
      );
      return { ignored: true, id: row.id };
    }
    if (existing !== null) await this.repository.delete({ id: existing.id });
    return { ignored: false, id: '' };
  }

  /** 批量查哪些分组已在忽略名单里。 */
  async byKeys(keys: string[]): Promise<{ keys: string[] }> {
    if (keys.length === 0) return { keys: [] };
    const rows = await this.repository.find({
      where: { mergeKey: In(keys) },
      select: { mergeKey: true },
      take: 2000,
    });
    return { keys: rows.map((row) => row.mergeKey) };
  }
}
