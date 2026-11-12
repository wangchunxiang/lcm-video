import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { autoMatchCategory } from '@lcm/shared';
import type { CategoryMatchInfo } from '@lcm/shared';
import { AppCrudService } from '../../common/crud/app-crud.service';
import { fetchClassList } from '../collect/classes';
import { CollectRunner } from '../collect/runner';
import type { StartResult } from '../collect/runner';
import type { SourceRuntime } from '../collect/types';
import { CollectSourceEntity } from './collect-source.entity';

/** 连通性测试结果。 */
export interface CollectSourceTestResult {
  ok: boolean;
  elapsedMs: number;
  categories: number;
  via: string;
  sample: string[];
  msg: string;
}

/** 拉取源站分类的结果。 */
export interface FetchCategoriesResult {
  total: number;
  synced: number;
  matched: number;
  unmapped: number;
}

/** 采集源站：标准 REST + 连通性测试 / 拉取分类并自动映射。 */
@Injectable()
export class CollectSourceService extends AppCrudService<CollectSourceEntity> {
  constructor(
    @InjectRepository(CollectSourceEntity) repository: Repository<CollectSourceEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly runner: CollectRunner,
  ) {
    super(repository);
  }

  /** 手动采集这个源站：rangeType 决定时间窗，缺省全部。 */
  async run(id: string, rangeType?: number): Promise<StartResult> {
    return this.runner.startSourceRun(id, { trigger: 'manual', rangeType });
  }

  /** 把实体转成采集引擎要的运行时配置。 */
  async loadRuntime(id: string): Promise<SourceRuntime> {
    const row = await this.repository.findOne({ where: { id } });
    if (row === null) throw new BadRequestException('采集源不存在');
    return {
      id: row.id,
      name: row.name,
      apiUrl: row.apiUrl,
      apiParams: row.apiParams,
      intervalSec: row.intervalSec,
      timeout: row.timeout,
      retryTimes: row.retryTimes,
      pagesize: row.pagesize,
    };
  }

  /** id → 源站名，供其他模块拼 `sourceName`。 */
  async nameMap(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id) => id !== ''))];
    if (unique.length === 0) return new Map();
    const rows = await this.dataSource.query<Array<{ id: string; name: string }>>(
      'SELECT id, name FROM lcm_collect_source WHERE id IN (?)',
      [unique],
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** `play_from` → 源站名，用于线路表显示来源。 */
  async playFromNameMap(): Promise<Map<string, string>> {
    const rows = await this.dataSource.query<Array<{ name: string; playFrom: string }>>(
      'SELECT name, play_from AS playFrom FROM lcm_collect_source WHERE play_from <> ""',
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      for (const from of row.playFrom.split(',')) {
        const key = from.trim();
        if (key !== '' && !map.has(key)) map.set(key, row.name);
      }
    }
    return map;
  }

  /** 只拉一次分类列表，不落库；探测失败不算接口失败。 */
  async test(id: string): Promise<CollectSourceTestResult> {
    const runtime = await this.loadRuntime(id);
    const startedAt = Date.now();
    try {
      const result = await fetchClassList(runtime);
      return {
        ok: true,
        elapsedMs: Date.now() - startedAt,
        categories: result.classes.length,
        via: result.via,
        sample: result.classes.slice(0, 10).map((item) => item.typeName),
        msg: '',
      };
    } catch (error) {
      return {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        categories: 0,
        via: '',
        sample: [],
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 拉取源站分类，写入映射表并对未映射的行跑一次自动匹配。 */
  async fetchCategories(id: string): Promise<FetchCategoriesResult> {
    const runtime = await this.loadRuntime(id);
    const startedAt = new Date();
    let classes: Array<{ typeId: string; typeName: string; typePid: string }>;
    try {
      classes = (await fetchClassList(runtime)).classes;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.repository.update(id, {
        lastSyncAt: startedAt,
        lastSyncStatus: 2,
        lastSyncMsg: msg.slice(0, 255),
      });
      throw new BadRequestException(`获取分类失败：${msg}`);
    }

    for (const item of classes) {
      await this.dataSource.query(
        `INSERT INTO lcm_collect_source_category
           (source_id, source_type_id, source_type_name, source_type_pid, category_id, match_type, status)
         VALUES (?, ?, ?, ?, 0, 0, 0)
         ON DUPLICATE KEY UPDATE source_type_name = VALUES(source_type_name),
                                 source_type_pid = VALUES(source_type_pid)`,
        [id, item.typeId, item.typeName, item.typePid],
      );
    }

    const categories = await this.dataSource.query<
      Array<{ id: string; pid: string; name: string; matchNames: string }>
    >('SELECT id, pid, name, match_names AS matchNames FROM lcm_category');
    const infos: CategoryMatchInfo[] = categories.map((row) => ({
      id: Number(row.id),
      pid: Number(row.pid),
      name: row.name,
      matchNames: row.matchNames === '' ? [] : row.matchNames.split(','),
    }));

    const pending = await this.dataSource.query<Array<{ id: string; name: string }>>(
      'SELECT id, source_type_name AS name FROM lcm_collect_source_category WHERE source_id = ? AND status = 0 AND category_id = 0',
      [id],
    );

    let matched = 0;
    for (const row of pending) {
      const target = autoMatchCategory(row.name, infos);
      if (target <= 0) continue;
      await this.dataSource.query(
        `UPDATE lcm_collect_source_category
            SET category_id = ?, status = 1, match_type = 1, updated_at = NOW()
          WHERE id = ?`,
        [String(target), row.id],
      );
      matched += 1;
    }

    const counts = await this.dataSource.query<Array<{ total: number; unmapped: number }>>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 0), 0) AS unmapped
         FROM lcm_collect_source_category WHERE source_id = ?`,
      [id],
    );
    await this.repository.update(id, {
      lastSyncAt: startedAt,
      lastSyncStatus: 1,
      lastSyncMsg: `同步 ${classes.length} 个分类，自动匹配 ${matched} 个`,
    });

    return {
      total: Number(counts[0]?.total ?? classes.length),
      synced: classes.length,
      matched,
      unmapped: Number(counts[0]?.unmapped ?? 0),
    };
  }
}
