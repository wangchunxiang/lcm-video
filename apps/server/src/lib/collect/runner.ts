import { eq, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import {
  collectLog,
  collectLogDetail,
  collectSource,
  collectSourceCategory,
  collectTask,
} from '@lcm/db';
import { autoMatchCategory, loadCategories } from './match.ts';
import { CollectClient } from './client.ts';
import { parseVodPage } from './parser.ts';
import { processPage, type CategoryInfo, type MappingInfo } from './writer.ts';

const RANGE_HOURS: Record<number, number | undefined> = {
  1: 24,
  2: 168,
  3: 720,
  4: undefined,
};

/** 同一采集源同一时刻只跑一个任务 */
const runningBySource = new Map<number, number>();
/** 任务 → 正在执行的 logId，用于取消 */
const runningByTask = new Map<number, number>();
const cancelFlags = new Map<number, boolean>();

export function isSourceBusy(sourceId: number): boolean {
  return runningBySource.has(sourceId);
}

export function getRunningLogId(taskId: number): number | undefined {
  return runningByTask.get(taskId);
}

/**
 * 采集在进程内跑，进程退出后留下的「进行中」记录永远不会结束。
 * 启动时统一收尾，避免采集记录列表里挂着一条假的进行中记录。
 */
export async function closeInterruptedLogs(db: Db): Promise<number> {
  const result = (await db
    .update(collectLog)
    .set({ status: 2, message: '服务重启，采集中断', finishedAt: sql`NOW()` })
    .where(eq(collectLog.status, 0))) as unknown as [{ affectedRows?: number }];
  return Number(result?.[0]?.affectedRows ?? 0);
}

export function cancelRun(taskId: number): number | undefined {
  const logId = runningByTask.get(taskId);
  if (logId === undefined) return undefined;
  cancelFlags.set(logId, true);
  return logId;
}

async function loadMapping(
  db: Db,
  sourceId: number,
  categories: CategoryInfo[],
): Promise<Map<string, MappingInfo>> {
  const rows = await db
    .select({
      id: collectSourceCategory.id,
      sourceTypeId: collectSourceCategory.sourceTypeId,
      sourceTypeName: collectSourceCategory.sourceTypeName,
      categoryId: collectSourceCategory.categoryId,
      status: collectSourceCategory.status,
    })
    .from(collectSourceCategory)
    .where(eq(collectSourceCategory.sourceId, sourceId));

  const map = new Map<string, MappingInfo>();
  const pending: Array<{ id: number; categoryId: number }> = [];

  for (const row of rows) {
    if (row.status === 0 && row.categoryId === 0) {
      const matched = autoMatchCategory(row.sourceTypeName, categories);
      if (matched > 0) {
        map.set(row.sourceTypeId, { categoryId: matched, status: 1 });
        pending.push({ id: row.id, categoryId: matched });
        continue;
      }
    }
    map.set(row.sourceTypeId, { categoryId: row.categoryId, status: row.status });
  }

  for (const item of pending) {
    await db
      .update(collectSourceCategory)
      .set({ categoryId: item.categoryId, matchType: 1, status: 1 })
      .where(eq(collectSourceCategory.id, item.id));
  }

  return map;
}

interface Counters {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
}

const emptyCounters = (): Counters => ({ total: 0, inserted: 0, updated: 0, skipped: 0, ignored: 0, failed: 0 });

async function executeRun(
  db: Db,
  task: typeof collectTask.$inferSelect,
  source: typeof collectSource.$inferSelect,
  logId: number,
): Promise<void> {
  const playFromSet = new Set<string>(
    (source.playFrom ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
  const counters = emptyCounters();
  let pagesDone = 0;
  let pageCount = 0;
  let consecutiveFail = 0;
  let cancelReason = '';
  let cancelled = false;
  let status = 1;

  try {
    const client = new CollectClient({
      id: source.id,
      name: source.name,
      apiUrl: source.apiUrl,
      apiFormat: source.apiFormat,
      apiParams: source.apiParams,
      intervalSec: source.intervalSec,
      timeout: source.timeout,
      retryTimes: source.retryTimes,
    });

    const categories = await loadCategories(db);
    const categoryMap = new Map(categories.map((item) => [item.id, item]));
    const mapping = await loadMapping(db, source.id, categories);
    const hours = RANGE_HOURS[task.rangeType];

    for (let page = 1; page <= 100000; page++) {
      if (cancelFlags.get(logId)) {
        cancelled = true;
        break;
      }

      let parsed;
      try {
        const raw = await client.request({
          ac: 'videolist',
          pg: page,
          pagesize: source.pagesize,
          at: source.apiFormat,
          h: hours,
        });
        parsed = parseVodPage(raw, source.apiFormat);
      } catch (error) {
        consecutiveFail += 1;
        const message = error instanceof Error ? error.message : String(error);
        await db.insert(collectLogDetail).values({
          logId,
          page,
          message: message.slice(0, 500),
        });
        pagesDone += 1;
        if (consecutiveFail >= 3) {
          status = 2;
          cancelReason = `连续 3 页请求失败，任务中止：${message}`;
          break;
        }
        if (pageCount > 0 && page >= pageCount) break;
        continue;
      }

      consecutiveFail = 0;
      if (parsed.pageCount > 0) pageCount = parsed.pageCount;
      if (parsed.list.length === 0) break;

      for (const item of parsed.list) {
        for (const from of item.playFrom ? item.playFrom.split('$$$') : []) {
          const value = from.trim();
          if (value) playFromSet.add(value);
        }
      }

      const result = await processPage(db, {
        sourceId: source.id,
        items: parsed.list,
        mapping,
        categories: categoryMap,
      });

      counters.total += result.counters.total;
      counters.inserted += result.counters.inserted;
      counters.updated += result.counters.updated;
      counters.skipped += result.counters.skipped;
      counters.ignored += result.counters.ignored;
      counters.failed += result.counters.failed;

      await db.insert(collectLogDetail).values({
        logId,
        page,
        total: result.counters.total,
        inserted: result.counters.inserted,
        updated: result.counters.updated,
        skipped: result.counters.skipped,
        ignored: result.counters.ignored,
        failed: result.counters.failed,
        failDetail: result.fails.length > 0 ? result.fails : null,
      });

      await db.update(collectLog).set({ ...counters }).where(eq(collectLog.id, logId));

      pagesDone += 1;
      if (pageCount > 0 && page >= pageCount) break;
    }
  } catch (error) {
    status = 2;
    cancelReason = error instanceof Error ? error.message : String(error);
  }

  if (cancelled) status = 3;

  const message = cancelled
    ? `已手动取消，完成 ${pagesDone}/${pageCount > 0 ? pageCount : '?'} 页`
    : status === 2
      ? cancelReason || '采集失败'
      : `完成 ${pagesDone} 页`;

  await db
    .update(collectLog)
    .set({
      status,
      message: message.slice(0, 500),
      finishedAt: sql`NOW()`,
      ...counters,
    })
    .where(eq(collectLog.id, logId));

  await db
    .update(collectTask)
    .set({
      lastRunAt: sql`NOW()`,
      lastRunStatus: status === 1 ? 1 : 2,
      lastRunMsg: message.slice(0, 255),
    })
    .where(eq(collectTask.id, task.id));

  await db
    .update(collectSource)
    .set({
      lastSyncAt: sql`NOW()`,
      lastSyncStatus: status === 1 ? 1 : 2,
      lastSyncMsg: message.slice(0, 255),
      playFrom: [...playFromSet].sort().join(',').slice(0, 500),
    })
    .where(eq(collectSource.id, source.id));
}

/**
 * 启动一个采集任务：校验 → 建日志 → 后台执行。
 * 立即返回 logId，执行过程不阻塞调用方。
 */
export async function startTask(
  db: Db,
  taskId: number,
): Promise<{ started: boolean; message: string; logId?: number }> {
  const taskRows = await db.select().from(collectTask).where(eq(collectTask.id, taskId)).limit(1);
  const task = taskRows[0];
  if (!task) return { started: false, message: '任务不存在' };

  const sourceRows = await db.select().from(collectSource).where(eq(collectSource.id, task.sourceId)).limit(1);
  const source = sourceRows[0];
  if (!source) return { started: false, message: '采集源不存在' };
  if (source.isEnabled !== 1) return { started: false, message: '采集源已停用' };
  if (runningBySource.has(source.id)) return { started: false, message: '同一采集源的另一个任务正在执行' };

  const inserted = await db
    .insert(collectLog)
    .values({ taskId: task.id, sourceId: source.id, status: 0 })
    .$returningId();
  const logId = inserted[0]?.id;
  if (!logId) return { started: false, message: '创建采集记录失败' };

  runningBySource.set(source.id, logId);
  runningByTask.set(task.id, logId);

  void executeRun(db, task, source, logId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(collectLog)
        .set({ status: 2, message: message.slice(0, 500), finishedAt: sql`NOW()` })
        .where(eq(collectLog.id, logId));
    })
    .finally(() => {
      runningBySource.delete(source.id);
      runningByTask.delete(task.id);
      cancelFlags.delete(logId);
    });

  return { started: true, message: '已开始执行', logId };
}
