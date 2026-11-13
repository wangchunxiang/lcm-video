import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { formatCollectSummary } from '@lcm/shared';
import { CategoryEntity } from '../category/category.entity';
import { CollectSourceCategoryEntity } from '../collect-source-category/collect-source-category.entity';
import { CollectSourceEntity } from '../collect-source/collect-source.entity';
import { CollectTaskLogDetailEntity } from '../collect-task-log-detail/collect-task-log-detail.entity';
import { CollectTaskLogEntity } from '../collect-task-log/collect-task-log.entity';
import { CollectTaskEntity } from '../collect-task/collect-task.entity';
import { CoverCheckEntity } from '../cover-check/cover-check.entity';
import { MergeRuleEntity } from '../vod-merge-rule/vod-merge-rule.entity';
import { SettingEntity } from '../setting/setting.entity';
import { CollectClient } from './client';
import { parseClassList, parseVodPage } from './parser';
import { loadBrokenCoverHosts, loadMergeConfig } from './merge';
import { describeError, processPage } from './writer';
import { emptyCounters } from './types';
import type { CategoryInfo, Counters, FailItem, MappingInfo } from './types';

export type RunTrigger = 'auto' | 'manual' | 'resume';

interface RunHandle {
  logId: string;
  taskId: string;
  controller: AbortController;
  startedAt: number;
  trigger: RunTrigger;
  finished: Promise<void>;
}

export interface StartResult {
  ok: boolean;
  logId?: string;
  msg?: string;
}

interface RunContext {
  logId: string;
  taskId: string;
  sourceId: string;
  /** 时间窗类型：1 最近 24 小时 / 2 最近 7 天 / 3 最近 30 天 / 4 全部 */
  rangeType: number;
  /** 续采起点：上一轮已经处理完的页码，从下一页继续 */
  resumePage: number;
  trigger: RunTrigger;
  counters: Counters;
  resumeCount: number;
}

const AUTO_DELAY_MS = 5_000;
const PAGE_FAIL_LIMIT = 3;
const FAIL_SAMPLE_LIMIT = 100;
const RANGE_HOURS: Record<number, number | undefined> = { 1: 24, 2: 24 * 7, 3: 24 * 30, 4: undefined };

export const RANGE_LABELS: Record<number, string> = {
  1: '最近 24 小时',
  2: '最近 7 天',
  3: '最近 30 天',
  4: '全部',
  0: '全部',
};

/** 运行中的采集：只在本进程内存里，重启后由 closeInterruptedLogs 收尾 */
const running = new Map<string, RunHandle>();

/** 手动采集的默认任务名 */
export const MANUAL_NAME = '手动采集';

/** 任务表里表示「没有关联任务」的 id */
const NO_TASK = '0';

@Injectable()
export class CollectRunner {
  private readonly logger = new Logger(CollectRunner.name);

  constructor(
    @InjectRepository(CollectTaskEntity)
    private readonly taskRepository: Repository<CollectTaskEntity>,
    @InjectRepository(CollectTaskLogEntity)
    private readonly logRepository: Repository<CollectTaskLogEntity>,
    @InjectRepository(CollectTaskLogDetailEntity)
    private readonly detailRepository: Repository<CollectTaskLogDetailEntity>,
    @InjectRepository(CollectSourceEntity)
    private readonly sourceRepository: Repository<CollectSourceEntity>,
    @InjectRepository(CollectSourceCategoryEntity)
    private readonly sourceCategoryRepository: Repository<CollectSourceCategoryEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(SettingEntity)
    private readonly settingRepository: Repository<SettingEntity>,
    @InjectRepository(CoverCheckEntity)
    private readonly coverCheckRepository: Repository<CoverCheckEntity>,
    @InjectRepository(MergeRuleEntity)
    private readonly mergeRuleRepository: Repository<MergeRuleEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 进程启动时调用：把上一轮遗留的「运行中」改判失败，否则任务永远显示在跑 */
  async closeInterruptedLogs(): Promise<void> {
    const message = '服务重启，任务已中断';
    const result = await this.logRepository.update(
      { status: 1 },
      { status: 3, finishedAt: new Date(), message },
    );
    const tasks = await this.taskRepository.update(
      { lastRunStatus: 1 },
      { lastRunStatus: 3, lastRunMsg: message },
    );
    const logs = result.affected ?? 0;
    const taskCount = tasks.affected ?? 0;
    if (logs > 0 || taskCount > 0) {
      this.logger.warn(`清理中断的采集记录 ${logs} 条、任务 ${taskCount} 个`);
    }
  }

  /** 任务队列触发：抢到锁才执行，抢不到说明别的实例/上一轮还在跑 */
  async startTask(taskId: string, trigger: RunTrigger = 'auto'): Promise<StartResult> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      select: {
        id: true,
        name: true,
        sourceId: true,
        isEnabled: true,
        lastRunStatus: true,
        rangeType: true,
      },
    });
    if (task === null) return { ok: false, msg: '任务不存在' };
    if (task.isEnabled !== 1) return { ok: false, msg: '任务已停用' };
    if (task.lastRunStatus === 1) return { ok: false, msg: '任务正在执行' };

    // 条件更新即抢锁：只有一个并发者能把 1 写进去（受影响行数 0 就是没抢到）
    const locked = await this.taskRepository.update(
      { id: taskId, isEnabled: 1, lastRunStatus: Not(1) },
      { lastRunStatus: 1, lastRunMsg: '正在执行' },
    );
    if ((locked.affected ?? 0) === 0) return { ok: false, msg: '任务正在执行' };

    return this.begin({
      taskId,
      sourceId: task.sourceId,
      taskName: task.name,
      trigger,
      resumePage: 0,
      rangeType: task.rangeType,
      resumeCount: 0,
    });
  }

  /** 手动采集一个源站：不需要任务行，记录里 taskId 记 0 */
  async startSourceRun(
    sourceId: string,
    options: { trigger?: RunTrigger; rangeType?: number },
  ): Promise<StartResult> {
    const source = await this.sourceRepository.findOne({
      where: { id: sourceId },
      select: { id: true, name: true, isEnabled: true },
    });
    if (source === null) return { ok: false, msg: '采集源不存在' };
    if (source.isEnabled !== 1) return { ok: false, msg: '采集源已停用' };

    const exists = await this.findRunningLog(sourceId);
    if (exists !== null) return { ok: false, msg: '该采集源正在采集，请先停止' };

    const mappingCount = await this.sourceCategoryRepository.count({ where: { sourceId } });
    if (mappingCount === 0) {
      return { ok: false, msg: '该采集源还没有分类映射，请先到「分类映射」里配置' };
    }

    return this.begin({
      taskId: NO_TASK,
      sourceId,
      taskName: `${MANUAL_NAME}·${source.name}`,
      trigger: options.trigger ?? 'manual',
      resumePage: 0,
      rangeType: options.rangeType ?? 4,
      resumeCount: 0,
    });
  }

  /** 断点续采：从记录的 last_page 下一页继续，不重跑已完成的页 */
  async startResume(logId: string): Promise<StartResult> {
    const log = await this.logRepository.findOne({
      where: { id: logId },
      select: {
        id: true,
        taskId: true,
        sourceId: true,
        taskName: true,
        status: true,
        lastPage: true,
        resumeCount: true,
        totalPages: true,
        rangeType: true,
      },
    });
    if (log === null) return { ok: false, msg: '采集记录不存在' };
    if (log.status === 1) return { ok: false, msg: '该记录正在运行' };
    if (log.status === 2) return { ok: false, msg: '该记录已成功完成，无需续采' };
    if (log.totalPages > 0 && log.lastPage >= log.totalPages) {
      return { ok: false, msg: '上次已经跑完全部页，请重新发起采集' };
    }

    const runningLog = await this.findRunningLog(log.sourceId);
    if (runningLog !== null) return { ok: false, msg: '该采集源正在采集，请先停止' };

    return this.begin({
      taskId: log.taskId,
      sourceId: log.sourceId,
      taskName: log.taskName,
      trigger: 'resume',
      resumePage: log.lastPage,
      rangeType: log.rangeType,
      resumeCount: log.resumeCount + 1,
      reuseLogId: logId,
    });
  }

  /** 取消：先 abort，跑不动（已在请求中）就等它自己结束；找不到运行时直接改库 */
  async cancel(logId: string): Promise<boolean> {
    const handle = running.get(logId);
    if (handle) {
      handle.controller.abort('用户取消');
      return true;
    }
    const result = await this.logRepository.update(
      { id: logId, status: 1 },
      { status: 4, finishedAt: new Date(), message: '已取消' },
    );
    const affected = result.affected ?? 0;
    if (affected > 0) await this.syncTaskStatus(logId, 4, '已取消');
    return affected > 0;
  }

  /** 按任务取消：以任务为线索找到当前运行中的记录 */
  async cancelByTask(taskId: string): Promise<boolean> {
    const log = await this.logRepository.findOne({
      where: { taskId, status: 1 },
      order: { id: 'DESC' },
      select: { id: true },
    });
    if (log !== null) return this.cancel(log.id);
    const tasks = await this.taskRepository.update(
      { id: taskId, lastRunStatus: 1 },
      { lastRunStatus: 4, lastRunMsg: '已取消' },
    );
    return (tasks.affected ?? 0) > 0;
  }

  isRunning(logId: string): boolean {
    return running.has(logId);
  }

  private async findRunningLog(sourceId: string): Promise<string | null> {
    const log = await this.logRepository.findOne({
      where: { sourceId, status: 1 },
      order: { id: 'DESC' },
      select: { id: true },
    });
    return log?.id ?? null;
  }

  /** 建记录 → 注册内存句柄 → 后台跑，立即返回 logId 给接口 */
  private async begin(input: {
    taskId: string;
    sourceId: string;
    taskName: string;
    trigger: RunTrigger;
    resumePage: number;
    rangeType: number;
    resumeCount: number;
    reuseLogId?: string;
  }): Promise<StartResult> {
    const source = await this.sourceRepository.findOne({ where: { id: input.sourceId } });
    if (source === null) return { ok: false, msg: '采集源不存在' };

    let logId = '';
    if (input.reuseLogId !== undefined) {
      logId = input.reuseLogId;
      // 条件更新即抢锁：两个并发续采只有一个能把记录从「已结束」改回「运行中」
      const claimed = await this.logRepository.update(
        { id: logId, status: Not(1) },
        { status: 1, resumeCount: input.resumeCount, finishedAt: null, message: '' },
      );
      if ((claimed.affected ?? 0) === 0) return { ok: false, msg: '该记录正在运行' };
    } else {
      // 同一源站同时只允许一路采集。startSourceRun/调度器前面的 findRunningLog 是
      // 「先查后写」，两个请求同时到达会都通过；这里锁住源站行再查一次才是原子的。
      const created = await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT id FROM lcm_collect_source WHERE id = ? FOR UPDATE', [input.sourceId]);
        const logRepository = manager.getRepository(CollectTaskLogEntity);
        const busy = await logRepository.findOne({
          where: { sourceId: input.sourceId, status: 1 },
          select: { id: true },
        });
        if (busy !== null) return null;
        return logRepository.save(
          logRepository.create({
            taskId: input.taskId,
            sourceId: input.sourceId,
            taskName: input.taskName,
            rangeType: input.rangeType,
            status: 1,
            resumeCount: input.resumeCount,
            startedAt: new Date(),
          }),
        );
      });
      if (created === null) return { ok: false, msg: '该采集源正在采集，请先停止' };
      logId = created.id;
    }

    const controller = new AbortController();
    const handle: RunHandle = {
      logId,
      taskId: input.taskId,
      controller,
      startedAt: Date.now(),
      trigger: input.trigger,
      finished: Promise.resolve(),
    };
    running.set(logId, handle);

    const context: RunContext = {
      logId,
      taskId: input.taskId,
      sourceId: input.sourceId,
      resumePage: input.resumePage,
      rangeType: input.rangeType,
      trigger: input.trigger,
      counters: emptyCounters(),
      resumeCount: input.resumeCount,
    };

    handle.finished = this.execute(context, source, controller)
      .catch((error: unknown) => {
        this.logger.error(`采集失败 log=${logId}：${describeError(error)}`);
        return this.finish(context, 3, `采集异常：${describeError(error)}`);
      })
      .catch((error: unknown) => {
        this.logger.error(`收尾失败 log=${logId}：${describeError(error)}`);
      })
      .finally(() => {
        running.delete(logId);
      });

    // 后台跑，不阻塞接口；后续由调度器/管理员查看进度
    void handle.finished;
    return { ok: true, logId };
  }

  private async execute(
    context: RunContext,
    source: CollectSourceEntity,
    controller: AbortController,
  ): Promise<void> {
    const { logId } = context;
    const signal = controller.signal;

    if (source.isEnabled === 0) {
      await this.finish(context, 3, '采集源已停用');
      return;
    }

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

    const mapping = await this.loadMapping(context.sourceId);
    const categories = await this.loadCategories();
    const merge = await loadMergeConfig(this.mergeRuleRepository, this.settingRepository);
    const brokenCoverHosts = await loadBrokenCoverHosts(this.coverCheckRepository);
    const hours = RANGE_HOURS[context.rangeType];

    let pageCount = 0;
    let page = context.resumePage;
    let pageFailures = 0;
    let canceled = false;
    let lastError = '';
    const seenSourceTypes = new Set<string>();

    // 需要拉分类清单才能自动补录源站分类；映射只有一级分类时也走这里
    try {
      const classes = parseClassList(await client.request({ ac: 'list' }));
      if (classes.length > 0) await this.upsertSourceCategories(context.sourceId, classes);
    } catch (error) {
      // 分类清单失败不影响采集，映射表里已有的照样能用
      this.logger.warn(`拉取源站分类失败 log=${logId}：${describeError(error)}`);
    }

    while (true) {
      if (signal.aborted) {
        canceled = true;
        break;
      }

      page += 1;
      // 网络请求在事务外；失败按次数上限放弃，避免源站挂了把整轮跑成失败
      const fetched = await client
        .request({
          ac: 'videolist',
          pg: page,
          pagesize: source.pagesize,
          // 苹果CMS 的 h 是「最近多少小时」；注意 t 是分类 id，传时间戳会被当成不存在的分类
          ...(hours !== undefined ? { h: hours } : {}),
        })
        .then(
          (raw) => ({ ok: true as const, value: parseVodPage(raw) }),
          (error: unknown) => ({ ok: false as const, error }),
        );

      if (!fetched.ok) {
        pageFailures += 1;
        lastError = describeError(fetched.error);
        await this.writeDetail(context, page, emptyCounters(), [], `请求失败：${lastError}`);
        if (pageFailures >= PAGE_FAIL_LIMIT) break;
        continue;
      }
      const data = fetched.value;

      pageFailures = 0;
      if (pageCount === 0) {
        pageCount = data.pageCount;
        await this.logRepository.update({ id: logId }, { totalPages: pageCount, lastPage: context.resumePage });
      }
      if (pageCount > 0 && page > pageCount) {
        page = pageCount;
        break;
      }

      let counters = emptyCounters();
      let fails: FailItem[] = [];
      let detailMessage = '';
      try {
        if (data.list.length > 0) {
          const unknownTypes = data.list.filter((item) => item.typeId && !seenSourceTypes.has(item.typeId));
          for (const item of unknownTypes) seenSourceTypes.add(item.typeId);
          if (unknownTypes.length > 0) {
            await this.upsertSourceCategories(
              context.sourceId,
              unknownTypes.map((item) => ({
                typeId: item.typeId,
                typeName: item.typeName,
                typePid: item.typePid,
              })),
            );
          }
          const result = await processPage(this.dataSource, {
            sourceId: context.sourceId,
            items: data.list,
            mapping,
            categories,
            merge,
            brokenCoverHosts,
          });
          counters = result.counters;
          fails = result.fails;
        }
      } catch (error) {
        detailMessage = `写库失败：${describeError(error)}`;
        counters = { ...emptyCounters(), total: data.list.length, failed: data.list.length };
      }

      this.addCounters(context.counters, counters);
      await this.writeDetail(context, page, counters, fails, detailMessage);
      await this.logRepository.update(
        { id: logId },
        { lastPage: page, ...this.counterPatch(context.counters) },
      );

      // 源站返回空页（pagecount 不准）也当作跑完
      if (data.list.length === 0) break;
      if (pageCount > 0 && page >= pageCount) break;
      if (pageCount === 0 && data.list.length < source.pagesize) break;
    }

    const { counters } = context;
    const summary = formatCollectSummary(counters);

    if (canceled) {
      await this.finish(context, 4, `已取消（${summary}）`);
    } else if (lastError && pageFailures >= PAGE_FAIL_LIMIT) {
      await this.finish(context, 3, `连续 ${PAGE_FAIL_LIMIT} 页请求失败：${lastError}（${summary}）`);
    } else {
      await this.finish(context, 2, summary);
    }

    // 两次任务之间留出间隔，避免整点多个任务同时打同一个源站
    if (context.trigger === 'auto') await sleep(AUTO_DELAY_MS);
  }

  private async finish(context: RunContext, status: number, message: string): Promise<void> {
    const { logId, counters } = context;
    const text = message.slice(0, 500);
    const interruptedMs =
      status === 4 ? Math.max(0, Date.now() - (running.get(logId)?.startedAt ?? Date.now())) : undefined;
    await this.logRepository.update(
      { id: logId },
      {
        status,
        message: text,
        finishedAt: new Date(),
        ...(interruptedMs === undefined ? {} : { interruptedMs }),
        ...this.counterPatch(counters),
        resumeCount: context.resumeCount,
      },
    );
    await this.syncTaskStatus(logId, status, text);
    this.logger.log(`采集结束 log=${logId} status=${status}：${text}`);
  }

  /** 记录收尾时同步任务表，任务列表才能显示上一次结果 */
  private async syncTaskStatus(logId: string, status: number, message: string): Promise<void> {
    const log = await this.logRepository.findOne({ where: { id: logId }, select: { taskId: true } });
    if (log === null || log.taskId === NO_TASK) return;
    await this.taskRepository.update(
      { id: log.taskId },
      { lastRunStatus: status, lastRunAt: new Date(), lastRunMsg: message.slice(0, 255) },
    );
  }

  private counterPatch(
    counters: Counters,
  ): Pick<CollectTaskLogEntity, 'total' | 'inserted' | 'updated' | 'skipped' | 'ignored' | 'failed'> {
    return {
      total: counters.total,
      inserted: counters.inserted,
      updated: counters.updated,
      skipped: counters.skipped,
      ignored: counters.ignored,
      failed: counters.failed,
    };
  }

  private addCounters(target: Counters, delta: Counters): void {
    target.total += delta.total;
    target.inserted += delta.inserted;
    target.updated += delta.updated;
    target.skipped += delta.skipped;
    target.ignored += delta.ignored;
    target.failed += delta.failed;
  }

  private async writeDetail(
    context: RunContext,
    page: number,
    counters: Counters,
    fails: FailItem[],
    message: string,
  ): Promise<void> {
    const samples = fails.slice(0, FAIL_SAMPLE_LIMIT);
    const existing = await this.detailRepository.findOne({
      where: { logId: context.logId, page },
      select: { id: true },
    });
    if (existing !== null) {
      await this.detailRepository.update(
        { id: existing.id },
        {
          ...this.counterPatch(counters),
          message: message.slice(0, 500),
          ...(samples.length > 0 ? { failDetail: samples } : {}),
        },
      );
      return;
    }
    await this.detailRepository.save(
      this.detailRepository.create({
        logId: context.logId,
        page,
        ...this.counterPatch(counters),
        ...(samples.length > 0 ? { failDetail: samples } : {}),
        message: message.slice(0, 500),
      }),
    );
  }

  /** 源站分类 → 本站分类 的映射；没登记过的源站分类先补一条「未映射」 */
  private async loadMapping(sourceId: string): Promise<Map<string, MappingInfo>> {
    const rows = await this.sourceCategoryRepository.find({
      where: { sourceId },
      select: { sourceTypeId: true, categoryId: true, status: true },
    });
    return new Map(rows.map((row) => [row.sourceTypeId, { categoryId: row.categoryId, status: row.status }]));
  }

  private async loadCategories(): Promise<Map<string, CategoryInfo>> {
    const rows = await this.categoryRepository.find({
      select: { id: true, pid: true, name: true, matchNames: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          pid: row.pid,
          name: row.name,
          matchNames: row.matchNames
            .split(/[,，]/)
            .map((part) => part.trim())
            .filter((part) => part !== ''),
        },
      ]),
    );
  }

  private async upsertSourceCategories(
    sourceId: string,
    classes: Array<{ typeId: string; typeName: string; typePid: string }>,
  ): Promise<void> {
    const valid = classes.filter((item) => item.typeId !== '');
    if (valid.length === 0) return;
    // 等价于 createMany({ skipDuplicates: true })：唯一键 uk_source_type 冲突时静默跳过
    const values = valid.flatMap((item) => [
      sourceId,
      item.typeId,
      item.typeName.slice(0, 100),
      item.typePid,
      NO_TASK,
      0,
      0,
    ]);
    const placeholders = valid.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    await this.dataSource.query(
      `INSERT IGNORE INTO lcm_collect_source_category
         (source_id, source_type_id, source_type_name, source_type_pid, category_id, match_type, status)
       VALUES ${placeholders}`,
      values,
    );
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
