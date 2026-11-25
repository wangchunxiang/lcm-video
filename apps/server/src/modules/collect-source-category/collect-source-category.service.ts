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

  /** 某个采集源下的全部映射 + 汇总。
   *
   * 不分页也不加 `take`：用它的界面（`Mappings.vue`）是全量渲染 + 客户端筛选，
   * 只给前 N 条会让「共 X 条」和列表对不上、多出来的那些行搜不到也改不了。
   * 真要分页，就连筛选一起搬到服务端，再改前端。
   */
  async bySource(
    sourceId: string,
  ): Promise<{ items: CollectSourceCategoryEntity[]; summary: MappingSummary }> {
    const items = await this.repository.find({
      where: { sourceId },
      order: { sourceTypeName: 'ASC', id: 'ASC' },
    });
    return { items, summary: await this.summarizeOf([sourceId]) };
  }

  /** 批量映射到某个分类，或标记为忽略。 */
  async map(input: MapInput): Promise<{ updated: number; summary: MappingSummary }> {
    if (input.ids.length === 0) throw new BadRequestException('请选择要处理的行');
    const toCategory = input.categoryId ?? '';
    if (input.status !== 2 && input.status !== 0 && (toCategory === '' || toCategory === '0')) {
      throw new BadRequestException('请选择本站分类');
    }
    // 三种动作只是 patch 不同，走同一条 UPDATE，`affected` 就是真实改动的行数
    const patch =
      input.status === 2
        ? { status: 2, categoryId: '0', matchType: 2 }
        : input.status === 0
          ? { status: 0, categoryId: '0', matchType: 0 }
          : { status: 1, categoryId: toCategory, matchType: 2 };
    const result = await this.repository.update({ id: In(input.ids) }, patch);

    const rows = await this.repository.find({
      where: { id: In(input.ids) },
      select: { sourceId: true },
    });
    const sourceIds = [...new Set(rows.map((row) => row.sourceId))];
    return { updated: result.affected ?? 0, summary: await this.summarizeOf(sourceIds) };
  }

  /** 一次自动匹配最多读多少行，避免把整个源的未映射行一次性读进内存。 */
  private static readonly MATCH_BATCH = 1000;

  /** 本站分类 + 别名，自动匹配用。 */
  private async categoryMatchInfos(): Promise<CategoryMatchInfo[]> {
    const categories = await this.dataSource.query<
      Array<{ id: string; pid: string; name: string; matchNames: string }>
    >('SELECT id, pid, name, match_names AS matchNames FROM lcm_category');
    return categories.map((row) => ({
      id: Number(row.id),
      pid: Number(row.pid),
      name: row.name,
      matchNames: row.matchNames === '' ? [] : row.matchNames.split(','),
    }));
  }

  /**
   * 对未映射的行按分类名/别名关键词自动匹配。
   * 分批扫到「某一批一条都没匹配上」为止，不再像原来那样被 `take: 1000` 静默截断。
   * 同一个源「点自动匹配」和「同步源站分类时顺手匹配」走的是这里，两边不会再漂。
   */
  async match(sourceId: string): Promise<{ scanned: number; matched: number }> {
    const infos = await this.categoryMatchInfos();
    let scanned = 0;
    let matched = 0;
    for (;;) {
      const pending = await this.repository.find({
        where: { sourceId, status: 0, categoryId: '0' },
        take: CollectSourceCategoryService.MATCH_BATCH,
      });
      if (pending.length === 0) return { scanned, matched };
      scanned += pending.length;
      let matchedInBatch = 0;
      for (const row of pending) {
        const target = autoMatchCategory(row.sourceTypeName, infos);
        if (target <= 0) continue;
        await this.repository.update(row.id, {
          status: 1,
          categoryId: String(target),
          matchType: 1,
        });
        matched += 1;
        matchedInBatch += 1;
      }
      // 这一批一条都没匹配上，说明剩下的也不会匹配，收工，否则会反复读同一批。
      if (matchedInBatch === 0) return { scanned, matched };
    }
  }

  /**
   * 批量写入源站分类：一条多行 INSERT，已有的只刷新名称与父 id，保留既有映射状态。
   * 采集 runner（`apps/server/src/modules/collect/runner.ts`）与后台「获取分类」都走这里，
   * 免得两个入口对新旧名字的判断不一致。
   */
  async upsertFromSource(
    sourceId: string,
    classes: Array<{ typeId: string; typeName: string; typePid: string }>,
  ): Promise<void> {
    // 空标识进库会变成一行永远匹配不上的脏数据，统一在入口挡掉
    const valid = classes.filter((item) => item.typeId !== '');
    if (valid.length === 0) return;
    const placeholders = valid.map(() => '(?, ?, ?, ?, 0, 0, 0)').join(', ');
    const values = valid.flatMap((item) => [
      sourceId,
      item.typeId,
      // source_type_name 是 varchar(100)，长名字截断入库而不是让整批失败
      item.typeName.slice(0, 100),
      item.typePid,
    ]);
    await this.dataSource.query(
      `INSERT INTO lcm_collect_source_category
         (source_id, source_type_id, source_type_name, source_type_pid, category_id, match_type, status)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         source_type_name = IF(source_type_name <=> VALUES(source_type_name),
                               source_type_name, VALUES(source_type_name)),
         source_type_pid = IF(source_type_pid <=> VALUES(source_type_pid),
                              source_type_pid, VALUES(source_type_pid))`,
      values,
    );
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
      'UPDATE lcm_vod SET category_id = ?, category_pid = ?, updated_at = ? WHERE category_id = ?',
      [row.categoryId, parent[0]?.pid ?? '0', new Date(), input.fromCategoryId],
    );
    return { affected, from: input.fromCategoryId, to: row.categoryId };
  }

  /**
   * 按源站聚合汇总：一条 GROUP BY 数完，不受列表 `take` 截断影响。
   * `status`：1 已映射 / 2 忽略 / 0 未处理。
   */
  private async summarizeOf(sourceIds: string[]): Promise<MappingSummary> {
    if (sourceIds.length === 0) return { total: 0, mapped: 0, ignored: 0, unmapped: 0 };
    const raw = await this.repository
      .createQueryBuilder('m')
      .select('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(m.status = 1), 0)', 'mapped')
      .addSelect('COALESCE(SUM(m.status = 2), 0)', 'ignored')
      .addSelect('COALESCE(SUM(m.status = 0), 0)', 'unmapped')
      .where('m.sourceId IN (:...sourceIds)', { sourceIds })
      .getRawOne<Record<'total' | 'mapped' | 'ignored' | 'unmapped', string>>();
    return {
      total: Number(raw?.total ?? 0),
      mapped: Number(raw?.mapped ?? 0),
      ignored: Number(raw?.ignored ?? 0),
      unmapped: Number(raw?.unmapped ?? 0),
    };
  }
}
