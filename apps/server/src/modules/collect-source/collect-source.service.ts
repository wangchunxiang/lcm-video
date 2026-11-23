import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Like, Not, Repository } from 'typeorm';
import type { DeleteResult, EntityManager, FindOptionsWhere } from 'typeorm';
import { AdFeatureEntity } from '../ad-feature/ad-feature.entity';
import { CollectSourceCategoryEntity } from '../collect-source-category/collect-source-category.entity';
import { CollectTaskLogDetailEntity } from '../collect-task-log-detail/collect-task-log-detail.entity';
import { CollectTaskLogEntity } from '../collect-task-log/collect-task-log.entity';
import { CollectTaskEntity } from '../collect-task/collect-task.entity';
import { CoverCheckEntity } from '../cover-check/cover-check.entity';
import { PlayLineEntity } from '../play-line/play-line.entity';
import { SourceRuleEntity } from '../source-rule/source-rule.entity';
import { VodPlayEntity } from '../vod-play/vod-play.entity';
import { VodEntity } from '../vod/vod.entity';
import { VodMergeIgnoreEntity } from '../vod-merge-ignore/vod-merge-ignore.entity';
import { CollectSourceCategoryService } from '../collect-source-category/collect-source-category.service';
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

/** 删源时连带清理的统计，前端可用来提示「到底删掉了什么」。 */
export interface PurgeResult {
  sources: number;
  mappings: number;
  tasks: number;
  logs: number;
  logDetails: number;
  rules: number;
  adFeatures: number;
  plays: number;
  vods: number;
  playLines: number;
  coverHosts: number;
  mergeIgnores: number;
  cancelled: number;
}

/** 采集源站：标准 REST + 连通性测试 / 拉取分类并自动映射。 */
@Injectable()
export class CollectSourceService extends AppCrudService<CollectSourceEntity> {
  constructor(
    @InjectRepository(CollectSourceEntity) repository: Repository<CollectSourceEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly runner: CollectRunner,
    private readonly sourceCategories: CollectSourceCategoryService,
  ) {
    super(repository);
  }

  /** 删除采集源：连着它的映射、任务、日志、规则、广告特征、播放地址与孤儿影片一起清掉。 */
  override async delete(
    criteria: string | FindOptionsWhere<CollectSourceEntity>,
    _softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    const ids =
      typeof criteria === 'string'
        ? [criteria]
        : (await this.repository.find({ where: criteria, select: { id: true } })).map((row) => row.id);
    return this.purgeAndReport(ids);
  }

  override async deleteMany(
    params: { ids?: string[] },
    _softDelete?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    // nest-crud 的 `/delete/bulk` 从 query 取 ids，标量会被包成 `['1,2,3']`，不拆会当成一个 id
    const ids = (params.ids ?? [])
      .flatMap((id) => String(id).split(','))
      .map((id) => id.trim())
      .filter((id) => id !== '');
    if (ids.length === 0) return { success: true, message: '没有需要删除的采集源' };
    return this.purgeAndReport(ids);
  }

  /** 跑一次彻底清理，把结果拼成一句能看懂的话。 */
  private async purgeAndReport(ids: string[]): Promise<{ success: boolean; message: string }> {
    const result = await this.purge(ids);
    if (result.sources === 0) return { success: false, message: '采集源不存在' };
    const parts = [
      result.cancelled > 0 ? `${result.cancelled} 个正在跑的采集已停止` : '',
      result.plays > 0 ? `${result.plays} 条播放地址` : '',
      result.vods > 0 ? `${result.vods} 部失去全部线路的影片` : '',
      result.logs > 0 ? `${result.logs} 条采集记录` : '',
      result.logDetails > 0 ? `${result.logDetails} 条采集明细` : '',
      result.mappings > 0 ? `${result.mappings} 条分类映射` : '',
      result.tasks > 0 ? `${result.tasks} 个采集任务` : '',
      result.rules > 0 ? `${result.rules} 条替换规则` : '',
      result.adFeatures > 0 ? `${result.adFeatures} 条广告特征` : '',
      result.playLines > 0 ? `${result.playLines} 条线路注册` : '',
      result.coverHosts > 0 ? `${result.coverHosts} 条域名体检记录` : '',
      result.mergeIgnores > 0 ? `${result.mergeIgnores} 条重复影片忽略记录` : '',
    ].filter((item) => item !== '');
    return {
      success: true,
      message: parts.length === 0 ? '已删除' : `已删除，同时清掉 ${parts.join('、')}`,
    };
  }

  /**
   * 彻底删掉采集源及其全部痕迹。
   *
   * 全库没有外键，只能按顺序手工清，顺序不能错：日志明细 → 日志 → 任务 → 分类映射 /
   * 替换规则 / 广告特征 → 播放地址 → 没线路的影片 → 线路注册 → 重复影片忽略记录 →
   * 域名体检 → 源本身。
   * 整段跑在一个事务里，中途失败全部回滚。
   */
  async purge(ids: string[]): Promise<PurgeResult> {
    const targets = [...new Set(ids.filter((id) => id !== ''))];
    const result: PurgeResult = {
      sources: 0,
      mappings: 0,
      tasks: 0,
      logs: 0,
      logDetails: 0,
      rules: 0,
      adFeatures: 0,
      plays: 0,
      vods: 0,
      playLines: 0,
      coverHosts: 0,
      mergeIgnores: 0,
      cancelled: 0,
    };
    if (targets.length === 0) return result;

    // 先停掉这个源正在跑的采集，并等它收尾写完，否则删完又会冒出一条指向已删源的日志
    result.cancelled = await this.runner.cancelBySource(targets);

    await this.dataSource.transaction(async (manager) => {
      // 日志明细挂在日志上，先拿到日志 id 才能删
      const logs = await manager.find(CollectTaskLogEntity, {
        where: { sourceId: In(targets) },
        select: { id: true },
      });
      const logIds = logs.map((log) => log.id);
      result.logs = logs.length;
      if (logIds.length > 0) {
        result.logDetails = await affected(manager.delete(CollectTaskLogDetailEntity, { logId: In(logIds) }));
        await manager.delete(CollectTaskLogEntity, { id: In(logIds) });
      }

      result.tasks = await affected(manager.delete(CollectTaskEntity, { sourceId: In(targets) }));
      result.mappings = await affected(
        manager.delete(CollectSourceCategoryEntity, { sourceId: In(targets) }),
      );
      result.rules = await affected(manager.delete(SourceRuleEntity, { sourceId: In(targets) }));
      result.adFeatures = await affected(manager.delete(AdFeatureEntity, { sourceId: In(targets) }));

      // 删播放地址之前先把受影响的影片记下来：删完这些影片里会有一批一条线路都不剩
      const affectedVods = await vodsOfSource(manager, targets);
      const lineIds = await linesOfSource(manager, targets);
      result.plays = await affected(manager.delete(VodPlayEntity, { sourceId: In(targets) }));

      // 失去全部线路的影片一并删掉，否则前台点进去只会「还没有可播放的线路」
      const orphans = await orphanVods(manager, affectedVods);
      result.vods = orphans.length;
      if (orphans.length > 0) await manager.delete(VodEntity, { id: In(orphans) });

      // 线路注册表：还有影片在用就留（前台线路名靠它），彻底没人用了才删
      if (lineIds.length > 0) {
        const stillUsed = await manager.find(VodPlayEntity, {
          where: { sourceFrom: In(lineIds) },
          select: { sourceFrom: true },
        });
        const used = new Set(stillUsed.map((row) => row.sourceFrom));
        const unused = lineIds.filter((line) => !used.has(line));
        if (unused.length > 0) {
          result.playLines = await affected(manager.delete(PlayLineEntity, { sourceFrom: In(unused) }));
        }
        // 剩下的线路还活着，但已不属于任何源（防御：一条线路只归属一个源）
        await manager.update(PlayLineEntity, { sourceId: In(targets) }, { sourceId: null });
      }

      // 重复影片忽略名单：`same:<源站 id>-<source_vod_id>` 这类键里烙着源站 id，
      // 源删掉后永远不会再匹配上任何分组（id 自增不复用），顺手清掉；
      // `auto:` / `suspect:` 是片名哈希，与源无关，交叉采集到同一部片时仍要生效，保留。
      for (const id of targets) {
        result.mergeIgnores += await affected(
          manager.delete(VodMergeIgnoreEntity, { mergeKey: Like(`same:${id}-%`) }),
        );
      }

      // 域名体检是快照表：影片删掉后可能整页空掉，顺手清掉已经没有封面引用的域名
      const hosts = await manager
        .createQueryBuilder(VodEntity, 'vod')
        .select('DISTINCT vod.coverHost', 'host')
        .where("vod.coverHost <> ''")
        .getRawMany<{ host: string }>();
      if (hosts.length > 0) {
        result.coverHosts = await affected(
          manager.delete(CoverCheckEntity, { host: Not(In(hosts.map((row) => row.host))) }),
        );
      }

      result.sources = await affected(manager.delete(CollectSourceEntity, { id: In(targets) }));
    });

    return result;
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

    // 一条多行 INSERT + 统一走分类服务的自动匹配，跟后台「自动匹配」按钮同一套逻辑
    await this.sourceCategories.upsertFromSource(id, classes);
    const { matched } = await this.sourceCategories.match(id);

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

/** 把 `delete()` 的返回值收成条数 */
async function affected(pending: Promise<DeleteResult>): Promise<number> {
  return (await pending).affected ?? 0;
}

/** 这些源下被播放地址引用的影片 id（去重） */
async function vodsOfSource(manager: EntityManager, sourceIds: string[]): Promise<string[]> {
  const rows = await manager
    .createQueryBuilder(VodPlayEntity, 'play')
    .select('DISTINCT play.vodId', 'vodId')
    .where('play.sourceId IN (:...ids)', { ids: sourceIds })
    .getRawMany<{ vodId: string }>();
  return rows.map((row) => row.vodId);
}

/** 这些源用到的线路标识：登记表里归属它 + 播放地址里实际出现的 */
async function linesOfSource(manager: EntityManager, sourceIds: string[]): Promise<string[]> {
  const lines = new Set<string>();
  const owned = await manager.find(PlayLineEntity, {
    where: { sourceId: In(sourceIds) },
    select: { sourceFrom: true },
  });
  for (const row of owned) if (row.sourceFrom !== '') lines.add(row.sourceFrom);
  const used = await manager.find(VodPlayEntity, {
    where: { sourceId: In(sourceIds) },
    select: { sourceFrom: true },
  });
  for (const row of used) if (row.sourceFrom !== '') lines.add(row.sourceFrom);
  return [...lines];
}

/** 给走定影片里，一条线路都不剩的那些（删完播放地址之后调用） */
async function orphanVods(manager: EntityManager, vodIds: string[]): Promise<string[]> {
  const orphans: string[] = [];
  const chunkSize = 2_000;
  for (let index = 0; index < vodIds.length; index += chunkSize) {
    const chunk = vodIds.slice(index, index + chunkSize);
    const alive = await manager.find(VodPlayEntity, {
      where: { vodId: In(chunk) },
      select: { vodId: true },
    });
    const aliveIds = new Set(alive.map((row) => row.vodId));
    for (const id of chunk) if (!aliveIds.has(id)) orphans.push(id);
  }
  return orphans;
}
