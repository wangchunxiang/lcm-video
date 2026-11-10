import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CollectClient } from './client.js';
import { parseClassList, parseVodPage } from './parser.js';
import { loadBrokenCoverHosts, loadMergeConfig } from './merge.js';
import { describeError, processPage } from './writer.js';
import {
  emptyCounters,
  type CategoryInfo,
  type Counters,
  type FailItem,
  type MappingInfo,
  type SourceRuntime,
} from './types.js';

export type RunTrigger = 'auto' | 'manual' | 'resume';

interface RunHandle {
  logId: number;
  taskId: number;
  controller: AbortController;
  startedAt: number;
  trigger: RunTrigger;
  finished: Promise<void>;
}

export interface StartResult {
  ok: boolean;
  logId?: number;
  msg?: string;
}

interface RunContext {
  logId: number;
  taskId: number;
  sourceId: number;
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
const running = new Map<number, RunHandle>();

/** 手动采集的默认任务名 */
export const MANUAL_NAME = '手动采集';

@Injectable()
export class CollectRunner {
  private readonly logger = new Logger(CollectRunner.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 进程启动时调用：把上一轮遗留的「运行中」改判失败，否则任务永远显示在跑 */
  async closeInterruptedLogs(): Promise<void> {
    const message = '服务重启，任务已中断';
    const result = await this.prisma.collectTaskLog.updateMany({
      where: { status: 1 },
      data: { status: 3, finishedAt: new Date(), message },
    });
    const tasks = await this.prisma.collectTask.updateMany({
      where: { lastRunStatus: 1 },
      data: { lastRunStatus: 3, lastRunMsg: message },
    });
    if (result.count > 0 || tasks.count > 0) {
      this.logger.warn(`清理中断的采集记录 ${result.count} 条、任务 ${tasks.count} 个`);
    }
  }

  /** 任务队列触发：抢到锁才执行，抢不到说明别的实例/上一轮还在跑 */
  async startTask(taskId: number, trigger: RunTrigger = 'auto'): Promise<StartResult> {
    const task = await this.prisma.collectTask.findUnique({
      where: { id: taskId },
      select: { id: true, name: true, sourceId: true, isEnabled: true, lastRunStatus: true, rangeType: true },
    });
    if (!task) return { ok: false, msg: '任务不存在' };
    if (task.isEnabled !== 1) return { ok: false, msg: '任务已停用' };
    if (task.lastRunStatus === 1) return { ok: false, msg: '任务正在执行' };

    // 条件更新即抢锁：只有一个并发者能把 1 写进去
    const locked = await this.prisma.collectTask.updateMany({
      where: { id: taskId, isEnabled: 1, lastRunStatus: { not: 1 } },
      data: { lastRunStatus: 1, lastRunMsg: '正在执行' },
    });
    if (locked.count === 0) return { ok: false, msg: '任务正在执行' };

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
    sourceId: number,
    options: { confirmEmpty: boolean; trigger?: RunTrigger },
  ): Promise<StartResult> {
    const source = await this.prisma.collectSource.findUnique({ where: { id: sourceId }, select: { id: true, name: true, isEnabled: true } });
    if (!source) return { ok: false, msg: '采集源不存在' };
    if (source.isEnabled !== 1) return { ok: false, msg: '采集源已停用' };

    const exists = await this.findRunningLog(sourceId);
    if (exists !== null) return { ok: false, msg: '该采集源正在采集，请先停止' };

    const mappingCount = await this.prisma.collectSourceCategory.count({ where: { sourceId } });
    if (mappingCount === 0) {
      return { ok: false, msg: '该采集源还没有分类映射，请先到「分类映射」里配置' };
    }

    if (!options.confirmEmpty) {
      // 预览：按最近一次成功的记录估算会写多少条，避免参数写错把空数据跑满一遍
      const last = await this.prisma.collectTaskLog.findFirst({
        where: { sourceId, status: 2 },
        orderBy: { id: 'desc' },
        select: { total: true, totalPages: true },
      });
      if (last && last.total === 0) {
        return { ok: false, msg: '上一次采集一条数据都没拿到，确认要重新采集吗？' };
      }
    }

    return this.begin({
      taskId: 0,
      sourceId,
      taskName: `${MANUAL_NAME}·${source.name}`,
      trigger: options.trigger ?? 'manual',
      resumePage: 0,
      rangeType: 4,
      resumeCount: 0,
    });
  }

  /** 断点续采：从记录的 last_page 下一页继续，不重跑已完成的页 */
  async startResume(logId: number): Promise<StartResult> {
    const log = await this.prisma.collectTaskLog.findUnique({
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
    if (!log) return { ok: false, msg: '采集记录不存在' };
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
  async cancel(logId: number): Promise<boolean> {
    const handle = running.get(logId);
    if (handle) {
      handle.controller.abort('用户取消');
      return true;
    }
    const result = await this.prisma.collectTaskLog.updateMany({
      where: { id: logId, status: 1 },
      data: { status: 4, finishedAt: new Date(), message: '已取消' },
    });
    if (result.count > 0) await this.syncTaskStatus(logId, 4, '已取消');
    return result.count > 0;
  }

  /** 按任务取消：以任务为线索找到当前运行中的记录 */
  async cancelByTask(taskId: number): Promise<boolean> {
    const log = await this.prisma.collectTaskLog.findFirst({
      where: { taskId, status: 1 },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (log) return this.cancel(log.id);
    const tasks = await this.prisma.collectTask.updateMany({
      where: { id: taskId, lastRunStatus: 1 },
      data: { lastRunStatus: 4, lastRunMsg: '已取消' },
    });
    return tasks.count > 0;
  }

  isRunning(logId: number): boolean {
    return running.has(logId);
  }

  private async findRunningLog(sourceId: number): Promise<number | null> {
    const log = await this.prisma.collectTaskLog.findFirst({
      where: { sourceId, status: 1 },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return log?.id ?? null;
  }

  /** 建记录 → 注册内存句柄 → 后台跑，立即返回 logId 给接口 */
  private async begin(input: {
    taskId: number;
    sourceId: number;
    taskName: string;
    trigger: RunTrigger;
    resumePage: number;
    rangeType: number;
    resumeCount: number;
    reuseLogId?: number;
  }): Promise<StartResult> {
    const source = await this.prisma.collectSource.findUnique({ where: { id: input.sourceId } });
    if (!source) return { ok: false, msg: '采集源不存在' };

    let logId = 0;
    if (input.reuseLogId !== undefined) {
      logId = input.reuseLogId;
      // 条件更新即抢锁：两个并发续采只有一个能把记录从「已结束」改回「运行中」
      const claimed = await this.prisma.collectTaskLog.updateMany({
        where: { id: logId, status: { not: 1 } },
        data: { status: 1, resumeCount: input.resumeCount, finishedAt: null, message: '' },
      });
      if (claimed.count === 0) return { ok: false, msg: '该记录正在运行' };
    } else {
      // 同一源站同时只允许一路采集。startSourceRun/调度器前面的 findRunningLog 是
      // 「先查后写」，两个请求同时到达会都通过；这里锁住源站行再查一次才是原子的。
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM lcm_collect_source WHERE id = ${input.sourceId} FOR UPDATE`;
        const busy = await tx.collectTaskLog.findFirst({
          where: { sourceId: input.sourceId, status: 1 },
          select: { id: true },
        });
        if (busy) return null;
        return tx.collectTaskLog.create({
          data: {
            taskId: input.taskId,
            sourceId: input.sourceId,
            taskName: input.taskName,
            rangeType: input.rangeType,
            status: 1,
            resumeCount: input.resumeCount,
            startedAt: new Date(),
          },
        });
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

  private async execute(context: RunContext, source: SourceRuntime & { isEnabled?: number }, controller: AbortController): Promise<void> {
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
    const merge = await loadMergeConfig(this.prisma);
    const brokenCoverHosts = await loadBrokenCoverHosts(this.prisma);
    const hours = RANGE_HOURS[context.rangeType];
    const since = hours === undefined ? undefined : Math.floor(Date.now() / 1000) - hours * 3600;

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
      let data;
      try {
        data = parseVodPage(
          await client.request({
            ac: 'videolist',
            pg: page,
            pagesize: source.pagesize,
            ...(since !== undefined ? { t: since } : {}),
          }),
        );
      } catch (error) {
        pageFailures += 1;
        lastError = describeError(error);
        await this.writeDetail(context, page, emptyCounters(), [], `请求失败：${lastError}`);
        if (pageFailures >= PAGE_FAIL_LIMIT) break;
        continue;
      }

      pageFailures = 0;
      if (pageCount === 0) {
        pageCount = data.pageCount;
        await this.prisma.collectTaskLog.update({
          where: { id: logId },
          data: { totalPages: pageCount, lastPage: context.resumePage },
        });
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
              unknownTypes.map((item) => ({ typeId: item.typeId, typeName: item.typeName, typePid: item.typePid })),
            );
          }
          const result = await processPage(this.prisma, {
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
      await this.prisma.collectTaskLog.update({
        where: { id: logId },
        data: { lastPage: page, ...this.counterPatch(context.counters) },
      });

      // 源站返回空页（pagecount 不准）也当作跑完
      if (data.list.length === 0) break;
      if (pageCount > 0 && page >= pageCount) break;
      if (pageCount === 0 && data.list.length < source.pagesize) break;
    }

    const { counters } = context;
    const summary = `共 ${counters.total} 条：新增 ${counters.inserted}、更新 ${counters.updated}、跳过 ${counters.skipped}、忽略 ${counters.ignored}、失败 ${counters.failed}`;

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
    await this.prisma.collectTaskLog.update({
      where: { id: logId },
      data: {
        status,
        message: text,
        finishedAt: new Date(),
        interruptedMs:
          status === 4 ? Math.max(0, Date.now() - (running.get(logId)?.startedAt ?? Date.now())) : undefined,
        ...this.counterPatch(counters),
        resumeCount: context.resumeCount,
      },
    });
    await this.syncTaskStatus(logId, status, text);
    this.logger.log(`采集结束 log=${logId} status=${status}：${text}`);
  }

  /** 记录收尾时同步任务表，任务列表才能显示上一次结果 */
  private async syncTaskStatus(logId: number, status: number, message: string): Promise<void> {
    const log = await this.prisma.collectTaskLog.findUnique({
      where: { id: logId },
      select: { taskId: true },
    });
    if (!log || log.taskId === 0) return;
    await this.prisma.collectTask.update({
      where: { id: log.taskId },
      data: { lastRunStatus: status, lastRunAt: new Date(), lastRunMsg: message.slice(0, 255) },
    });
  }

  private counterPatch(counters: Counters) {
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
    const data = {
      ...this.counterPatch(counters),
      failDetail: samples.length > 0 ? (samples as unknown as object) : undefined,
      message: message.slice(0, 500),
    };
    const existing = await this.prisma.collectTaskLogDetail.findFirst({
      where: { logId: context.logId, page },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.collectTaskLogDetail.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.collectTaskLogDetail.create({
        data: { logId: context.logId, page, ...data },
      });
    }
  }

  /** 源站分类 → 本站分类 的映射；没登记过的源站分类先补一条「未映射」 */
  private async loadMapping(sourceId: number): Promise<Map<string, MappingInfo>> {
    const rows = await this.prisma.collectSourceCategory.findMany({
      where: { sourceId },
      select: { sourceTypeId: true, categoryId: true, status: true },
    });
    return new Map(rows.map((row) => [row.sourceTypeId, { categoryId: row.categoryId, status: row.status }]));
  }

  private async loadCategories(): Promise<Map<number, CategoryInfo>> {
    const rows = await this.prisma.category.findMany({
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
    sourceId: number,
    classes: Array<{ typeId: string; typeName: string; typePid: string }>,
  ): Promise<void> {
    const valid = classes.filter((item) => item.typeId !== '');
    if (valid.length === 0) return;
    await this.prisma.collectSourceCategory.createMany({
      data: valid.map((item) => ({
        sourceId,
        sourceTypeId: item.typeId,
        sourceTypeName: item.typeName.slice(0, 100),
        sourceTypePid: item.typePid,
        categoryId: 0,
        matchType: 0,
        status: 0,
      })),
      skipDuplicates: true,
    });
  }

}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
