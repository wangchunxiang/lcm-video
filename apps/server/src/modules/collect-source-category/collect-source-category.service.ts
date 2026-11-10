import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { autoMatchCategory } from '@lcm/shared';
import type { CategoryMatchInfo } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { CollectSourceCategoryEntity } from './collect-source-category.entity';

/** 某源站分类的映射汇总。 */
export interface MappingSummary {
  total: number;
  mapped: number;
  ignored: number;
  unmapped: number;
}

/** 批量映射/忽略的入参。 */
export interface MapInput {
  ids: string[];
  categoryId?: string;
  status?: number;
}

/** 源站分类映射：标准 REST + 按源查询 / 批量映射 / 自动匹配 / 重刷影片分类。 */
@Injectable()
export class CollectSourceCategoryService extends AppCrudService<CollectSourceCategoryEntity> {
  constructor(
    @InjectRepository(CollectSourceCategoryEntity)
    repository: Repository<CollectSourceCategoryEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  /** 某个采集源下的全部映射 + 汇总。 */
  async bySource(
    sourceId: string,
  ): Promise<{ items: CollectSourceCategoryEntity[]; summary: MappingSummary }> {
    const items = await this.repository.find({
      where: { sourceId },
      order: { sourceTypeName: 'ASC', id: 'ASC' },
      take: 1000,
    });
    return { items, summary: this.summarize(items) };
  }

  /** 批量映射到某个分类，或标记为忽略。 */
  async map(input: MapInput): Promise<{ updated: number; summary: MappingSummary }> {
    if (input.ids.length === 0) throw new BadRequestException('请选择要处理的行');
    if (input.status === 2) {
      await this.repository.update(
        { id: In(input.ids) },
        { status: 2, categoryId: '0', matchType: 2 },
      );
    } else if (input.status === 0) {
      await this.repository.update(
        { id: In(input.ids) },
        { status: 0, categoryId: '0', matchType: 0 },
      );
    } else {
      if (input.categoryId === undefined || input.categoryId === '' || input.categoryId === '0') {
        throw new BadRequestException('请选择本站分类');
      }
      await this.repository.update(
        { id: In(input.ids) },
        { status: 1, categoryId: input.categoryId, matchType: 2 },
      );
    }
    const rows = await this.repository.find({ where: { id: In(input.ids) } });
    const sourceIds = [...new Set(rows.map((row) => row.sourceId))];
    const all: CollectSourceCategoryEntity[] = [];
    for (const sourceId of sourceIds) {
      all.push(...(await this.repository.find({ where: { sourceId }, take: 1000 })));
    }
    return { updated: rows.length, summary: this.summarize(all) };
  }

  /** 对未映射的行按分类名/别名关键词自动匹配。 */
  async match(sourceId: string): Promise<{ scanned: number; matched: number }> {
    const categories = await this.dataSource.query<
      Array<{ id: string; pid: string; name: string; matchNames: string }>
    >('SELECT id, pid, name, match_names AS matchNames FROM lcm_category');
    const infos: CategoryMatchInfo[] = categories.map((row) => ({
      id: Number(row.id),
      pid: Number(row.pid),
      name: row.name,
      matchNames: row.matchNames === '' ? [] : row.matchNames.split(','),
    }));

    const pending = await this.repository.find({
      where: { sourceId, status: 0, categoryId: '0' },
      take: 1000,
    });
    let matched = 0;
    for (const row of pending) {
      const target = autoMatchCategory(row.sourceTypeName, infos);
      if (target <= 0) continue;
      await this.repository.update(row.id, {
        status: 1,
        categoryId: String(target),
        matchType: 1,
      });
      matched += 1;
    }
    return { scanned: pending.length, matched };
  }

  /** 把某个源站分类下的影片整体改到映射后的本站分类。 */
  async remapVods(input: {
    sourceId: string;
    id: string;
    fromCategoryId: string;
  }): Promise<{ affected: number; from: string; to: string }> {
    const row = await this.repository.findOne({ where: { id: input.id } });
    if (row === null) throw new BadRequestException('映射记录不存在');
    if (row.categoryId === '' || row.categoryId === '0') {
      throw new BadRequestException('这条源站分类还没有映射到本站分类');
    }
    if (row.categoryId === input.fromCategoryId) {
      throw new BadRequestException('目标分类与来源分类相同，不需要重刷');
    }

    const count = await this.dataSource.query<Array<{ total: number }>>(
      'SELECT COUNT(*) AS total FROM lcm_vod WHERE category_id = ?',
      [input.fromCategoryId],
    );
    const affected = Number(count[0]?.total ?? 0);
    if (affected === 0) return { affected: 0, from: input.fromCategoryId, to: row.categoryId };

    const parent = await this.dataSource.query<Array<{ pid: string }>>(
      'SELECT pid FROM lcm_category WHERE id = ? LIMIT 1',
      [row.categoryId],
    );
    await this.dataSource.query(
      'UPDATE lcm_vod SET category_id = ?, category_pid = ?, updated_at = NOW() WHERE category_id = ?',
      [row.categoryId, parent[0]?.pid ?? '0', input.fromCategoryId],
    );
    return { affected, from: input.fromCategoryId, to: row.categoryId };
  }

  private summarize(items: CollectSourceCategoryEntity[]): MappingSummary {
    return {
      total: items.length,
      mapped: items.filter((row) => row.status === 1).length,
      ignored: items.filter((row) => row.status === 2).length,
      unmapped: items.filter((row) => row.status === 0).length,
    };
  }
}
